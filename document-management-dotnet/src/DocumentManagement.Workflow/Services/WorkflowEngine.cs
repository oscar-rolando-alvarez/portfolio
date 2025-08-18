using DocumentManagement.Domain.Enums;
using DocumentManagement.Workflow.Models;
using DocumentManagement.Workflow.Steps;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace DocumentManagement.Workflow.Services;

public interface IWorkflowEngine
{
    Task<Guid> StartWorkflowAsync(string workflowDefinitionId, Guid documentId, Guid tenantId, string startedBy, Dictionary<string, object>? initialData = null);
    Task<bool> ExecuteActionAsync(Guid instanceId, WorkflowAction action);
    Task<WorkflowExecutionContext?> GetWorkflowInstanceAsync(Guid instanceId);
    Task<List<WorkflowExecutionContext>> GetActiveWorkflowsAsync(Guid tenantId);
    Task<List<WorkflowExecutionContext>> GetUserTasksAsync(string userId, Guid tenantId);
    Task<bool> CancelWorkflowAsync(Guid instanceId, string cancelledBy, string reason);
    Task<bool> RestartWorkflowAsync(Guid instanceId, string restartedBy);
    Task ProcessTimeoutedWorkflowsAsync();
    Task<WorkflowDefinition?> GetWorkflowDefinitionAsync(string workflowId);
    Task SaveWorkflowDefinitionAsync(WorkflowDefinition definition);
    Task<List<WorkflowDefinition>> GetWorkflowDefinitionsAsync(Guid tenantId);
}

public class WorkflowEngine : IWorkflowEngine
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IWorkflowRepository _repository;
    private readonly IWorkflowNotificationService _notificationService;
    private readonly ILogger<WorkflowEngine> _logger;
    private readonly Dictionary<string, Type> _stepTypes;

    public WorkflowEngine(
        IServiceProvider serviceProvider,
        IWorkflowRepository repository,
        IWorkflowNotificationService notificationService,
        ILogger<WorkflowEngine> logger)
    {
        _serviceProvider = serviceProvider;
        _repository = repository;
        _notificationService = notificationService;
        _logger = logger;
        
        _stepTypes = new Dictionary<string, Type>
        {
            [WorkflowStepTypes.Manual] = typeof(ManualStep),
            [WorkflowStepTypes.Approval] = typeof(ApprovalStep),
            [WorkflowStepTypes.Review] = typeof(ReviewStep),
            [WorkflowStepTypes.Notification] = typeof(NotificationStep),
            [WorkflowStepTypes.Script] = typeof(ScriptStep),
            [WorkflowStepTypes.Condition] = typeof(ConditionStep),
            [WorkflowStepTypes.Timer] = typeof(TimerStep),
            [WorkflowStepTypes.EmailSend] = typeof(EmailSendStep)
        };
    }

    public async Task<Guid> StartWorkflowAsync(string workflowDefinitionId, Guid documentId, Guid tenantId, string startedBy, Dictionary<string, object>? initialData = null)
    {
        try
        {
            var definition = await GetWorkflowDefinitionAsync(workflowDefinitionId);
            if (definition == null)
            {
                throw new InvalidOperationException($"Workflow definition '{workflowDefinitionId}' not found");
            }

            var instanceId = Guid.NewGuid();
            var context = new WorkflowExecutionContext
            {
                InstanceId = instanceId,
                DocumentId = documentId,
                TenantId = tenantId,
                WorkflowDefinitionId = workflowDefinitionId,
                Status = WorkflowStatus.InProgress,
                StartedBy = startedBy,
                Data = initialData ?? new Dictionary<string, object>()
            };

            // Add global data from definition
            foreach (var kvp in definition.GlobalData)
            {
                context.Data[kvp.Key] = kvp.Value;
            }

            await _repository.SaveWorkflowInstanceAsync(context);

            // Start the first step
            var firstStep = definition.Steps.OrderBy(s => s.Order).FirstOrDefault();
            if (firstStep != null)
            {
                await ExecuteStepAsync(context, firstStep, definition);
            }
            else
            {
                context.Status = WorkflowStatus.Completed;
                context.CompletedAt = DateTime.UtcNow;
                await _repository.SaveWorkflowInstanceAsync(context);
            }

            _logger.LogInformation("Workflow {WorkflowId} started for document {DocumentId} with instance {InstanceId}", 
                workflowDefinitionId, documentId, instanceId);

            return instanceId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start workflow {WorkflowId} for document {DocumentId}", workflowDefinitionId, documentId);
            throw;
        }
    }

    public async Task<bool> ExecuteActionAsync(Guid instanceId, WorkflowAction action)
    {
        try
        {
            var context = await GetWorkflowInstanceAsync(instanceId);
            if (context == null)
            {
                _logger.LogWarning("Workflow instance {InstanceId} not found", instanceId);
                return false;
            }

            if (context.Status != WorkflowStatus.InProgress && context.Status != WorkflowStatus.Waiting)
            {
                _logger.LogWarning("Cannot execute action on workflow instance {InstanceId} with status {Status}", instanceId, context.Status);
                return false;
            }

            var definition = await GetWorkflowDefinitionAsync(context.WorkflowDefinitionId);
            if (definition == null)
            {
                _logger.LogWarning("Workflow definition {WorkflowId} not found for instance {InstanceId}", context.WorkflowDefinitionId, instanceId);
                return false;
            }

            var currentStep = definition.Steps.FirstOrDefault(s => s.Id == action.StepId);
            if (currentStep == null)
            {
                _logger.LogWarning("Step {StepId} not found in workflow definition {WorkflowId}", action.StepId, context.WorkflowDefinitionId);
                return false;
            }

            // Execute the action on the current step
            var stepExecution = context.StepExecutions.FirstOrDefault(se => se.StepId == action.StepId && se.Status == WorkflowStatus.InProgress);
            if (stepExecution == null)
            {
                _logger.LogWarning("No active step execution found for step {StepId} in instance {InstanceId}", action.StepId, instanceId);
                return false;
            }

            var stepHandler = CreateStepHandler(currentStep.StepType);
            if (stepHandler == null)
            {
                _logger.LogError("No handler found for step type {StepType}", currentStep.StepType);
                return false;
            }

            var result = await stepHandler.ExecuteActionAsync(context, currentStep, action);
            
            if (result.Success)
            {
                stepExecution.Status = result.Status;
                stepExecution.CompletedAt = DateTime.UtcNow;
                stepExecution.OutputData = result.OutputData;
                stepExecution.Comments = action.Comments;

                // Update context data with step outputs
                foreach (var kvp in result.OutputData)
                {
                    context.Data[kvp.Key] = kvp.Value;
                }

                await _repository.SaveWorkflowInstanceAsync(context);

                // Move to next step if current step is completed
                if (result.Status == WorkflowStatus.Completed)
                {
                    await ProcessNextStepAsync(context, currentStep, definition);
                }

                _logger.LogInformation("Action {Action} executed successfully on step {StepId} in workflow instance {InstanceId}", 
                    action.Action, action.StepId, instanceId);

                return true;
            }
            else
            {
                stepExecution.Status = WorkflowStatus.Failed;
                stepExecution.ErrorMessage = result.ErrorMessage;
                stepExecution.CompletedAt = DateTime.UtcNow;

                context.Status = WorkflowStatus.Failed;
                context.ErrorMessage = result.ErrorMessage;

                await _repository.SaveWorkflowInstanceAsync(context);

                _logger.LogWarning("Action {Action} failed on step {StepId} in workflow instance {InstanceId}: {Error}", 
                    action.Action, action.StepId, instanceId, result.ErrorMessage);

                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while executing action {Action} on workflow instance {InstanceId}", action.Action, instanceId);
            return false;
        }
    }

    public async Task<WorkflowExecutionContext?> GetWorkflowInstanceAsync(Guid instanceId)
    {
        return await _repository.GetWorkflowInstanceAsync(instanceId);
    }

    public async Task<List<WorkflowExecutionContext>> GetActiveWorkflowsAsync(Guid tenantId)
    {
        return await _repository.GetActiveWorkflowsAsync(tenantId);
    }

    public async Task<List<WorkflowExecutionContext>> GetUserTasksAsync(string userId, Guid tenantId)
    {
        return await _repository.GetUserTasksAsync(userId, tenantId);
    }

    public async Task<bool> CancelWorkflowAsync(Guid instanceId, string cancelledBy, string reason)
    {
        try
        {
            var context = await GetWorkflowInstanceAsync(instanceId);
            if (context == null)
            {
                return false;
            }

            context.Status = WorkflowStatus.Cancelled;
            context.CompletedAt = DateTime.UtcNow;
            context.ErrorMessage = $"Cancelled by {cancelledBy}: {reason}";

            // Cancel all active step executions
            foreach (var stepExecution in context.StepExecutions.Where(se => se.Status == WorkflowStatus.InProgress))
            {
                stepExecution.Status = WorkflowStatus.Cancelled;
                stepExecution.CompletedAt = DateTime.UtcNow;
                stepExecution.ErrorMessage = "Workflow cancelled";
            }

            await _repository.SaveWorkflowInstanceAsync(context);

            await _notificationService.SendWorkflowCancelledNotificationAsync(context, cancelledBy, reason);

            _logger.LogInformation("Workflow instance {InstanceId} cancelled by {CancelledBy}: {Reason}", instanceId, cancelledBy, reason);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cancel workflow instance {InstanceId}", instanceId);
            return false;
        }
    }

    public async Task<bool> RestartWorkflowAsync(Guid instanceId, string restartedBy)
    {
        try
        {
            var context = await GetWorkflowInstanceAsync(instanceId);
            if (context == null)
            {
                return false;
            }

            var definition = await GetWorkflowDefinitionAsync(context.WorkflowDefinitionId);
            if (definition == null)
            {
                return false;
            }

            // Reset workflow state
            context.Status = WorkflowStatus.InProgress;
            context.CompletedAt = null;
            context.ErrorMessage = null;
            context.StepExecutions.Clear();

            await _repository.SaveWorkflowInstanceAsync(context);

            // Start the first step
            var firstStep = definition.Steps.OrderBy(s => s.Order).FirstOrDefault();
            if (firstStep != null)
            {
                await ExecuteStepAsync(context, firstStep, definition);
            }

            _logger.LogInformation("Workflow instance {InstanceId} restarted by {RestartedBy}", instanceId, restartedBy);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to restart workflow instance {InstanceId}", instanceId);
            return false;
        }
    }

    public async Task ProcessTimeoutedWorkflowsAsync()
    {
        try
        {
            var timeoutedWorkflows = await _repository.GetTimeoutedWorkflowsAsync();
            
            foreach (var workflow in timeoutedWorkflows)
            {
                workflow.Status = WorkflowStatus.Failed;
                workflow.ErrorMessage = "Workflow timed out";
                workflow.CompletedAt = DateTime.UtcNow;

                await _repository.SaveWorkflowInstanceAsync(workflow);
                await _notificationService.SendWorkflowTimeoutNotificationAsync(workflow);

                _logger.LogWarning("Workflow instance {InstanceId} timed out", workflow.InstanceId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process timed out workflows");
        }
    }

    public async Task<WorkflowDefinition?> GetWorkflowDefinitionAsync(string workflowId)
    {
        return await _repository.GetWorkflowDefinitionAsync(workflowId);
    }

    public async Task SaveWorkflowDefinitionAsync(WorkflowDefinition definition)
    {
        await _repository.SaveWorkflowDefinitionAsync(definition);
    }

    public async Task<List<WorkflowDefinition>> GetWorkflowDefinitionsAsync(Guid tenantId)
    {
        return await _repository.GetWorkflowDefinitionsAsync(tenantId);
    }

    private async Task ExecuteStepAsync(WorkflowExecutionContext context, WorkflowStep step, WorkflowDefinition definition)
    {
        try
        {
            var stepExecution = new WorkflowStepExecution
            {
                StepId = step.Id,
                StepName = step.Name,
                Status = WorkflowStatus.InProgress,
                InputData = new Dictionary<string, object>(step.Inputs)
            };

            // Evaluate assigned user/role
            if (!string.IsNullOrEmpty(step.AssignedUser))
            {
                stepExecution.AssignedTo = step.AssignedUser;
            }
            else if (!string.IsNullOrEmpty(step.AssignedRole))
            {
                // In a real implementation, you would resolve users with this role
                stepExecution.AssignedTo = step.AssignedRole;
            }

            context.StepExecutions.Add(stepExecution);
            context.CurrentStepId = step.Id;

            await _repository.SaveWorkflowInstanceAsync(context);

            var stepHandler = CreateStepHandler(step.StepType);
            if (stepHandler != null)
            {
                var result = await stepHandler.ExecuteAsync(context, step);
                
                stepExecution.Status = result.Status;
                stepExecution.OutputData = result.OutputData;
                
                if (result.Status == WorkflowStatus.Completed)
                {
                    stepExecution.CompletedAt = DateTime.UtcNow;
                    await ProcessNextStepAsync(context, step, definition);
                }
                else if (result.Status == WorkflowStatus.Failed)
                {
                    stepExecution.ErrorMessage = result.ErrorMessage;
                    stepExecution.CompletedAt = DateTime.UtcNow;
                    context.Status = WorkflowStatus.Failed;
                    context.ErrorMessage = result.ErrorMessage;
                }

                await _repository.SaveWorkflowInstanceAsync(context);
            }
            else
            {
                _logger.LogError("No handler found for step type: {StepType}", step.StepType);
                stepExecution.Status = WorkflowStatus.Failed;
                stepExecution.ErrorMessage = $"No handler found for step type: {step.StepType}";
                context.Status = WorkflowStatus.Failed;
                context.ErrorMessage = stepExecution.ErrorMessage;
                
                await _repository.SaveWorkflowInstanceAsync(context);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute step {StepId} in workflow instance {InstanceId}", step.Id, context.InstanceId);
            throw;
        }
    }

    private async Task ProcessNextStepAsync(WorkflowExecutionContext context, WorkflowStep currentStep, WorkflowDefinition definition)
    {
        try
        {
            // Evaluate transitions
            WorkflowStep? nextStep = null;
            
            foreach (var transition in currentStep.Transitions)
            {
                if (string.IsNullOrEmpty(transition.Condition) || await EvaluateConditionAsync(transition.Condition, context))
                {
                    nextStep = definition.Steps.FirstOrDefault(s => s.Id == transition.TargetStepId);
                    break;
                }
            }

            // If no transition found, try to find next step by order
            if (nextStep == null)
            {
                nextStep = definition.Steps
                    .Where(s => s.Order > currentStep.Order)
                    .OrderBy(s => s.Order)
                    .FirstOrDefault();
            }

            if (nextStep != null)
            {
                await ExecuteStepAsync(context, nextStep, definition);
            }
            else
            {
                // Workflow completed
                context.Status = WorkflowStatus.Completed;
                context.CompletedAt = DateTime.UtcNow;
                await _repository.SaveWorkflowInstanceAsync(context);
                
                await _notificationService.SendWorkflowCompletedNotificationAsync(context);
                
                _logger.LogInformation("Workflow instance {InstanceId} completed", context.InstanceId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process next step for workflow instance {InstanceId}", context.InstanceId);
            throw;
        }
    }

    private IWorkflowStep? CreateStepHandler(string stepType)
    {
        if (_stepTypes.TryGetValue(stepType, out var handlerType))
        {
            return _serviceProvider.GetService(handlerType) as IWorkflowStep;
        }
        return null;
    }

    private async Task<bool> EvaluateConditionAsync(string condition, WorkflowExecutionContext context)
    {
        // Simple condition evaluation - in a real implementation, you might use a more sophisticated expression evaluator
        try
        {
            // Example: "status == 'approved'" or "amount > 1000"
            // For now, return true - implement proper condition evaluation based on your needs
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to evaluate condition: {Condition}", condition);
            return false;
        }
    }
}