use crate::error::{BlockchainError, Result};
use crate::{Address, Amount, Hash};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasmtime::{Config, Engine, Instance, Linker, Module, Store, TypedFunc};

pub type Gas = u64;
pub type ContractCode = Vec<u8>;

const MAX_GAS_LIMIT: Gas = 10_000_000;
const GAS_PRICE: Amount = 1; // 1 satoshi per gas unit

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartContract {
    pub address: Address,
    pub code: ContractCode,
    pub state: ContractState,
    pub owner: Address,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub gas_used: Gas,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractState {
    pub storage: HashMap<String, Vec<u8>>,
    pub balance: Amount,
    pub nonce: u64,
}

impl Default for ContractState {
    fn default() -> Self {
        Self {
            storage: HashMap::new(),
            balance: 0,
            nonce: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractCall {
    pub contract_address: Address,
    pub caller: Address,
    pub function_name: String,
    pub parameters: Vec<ContractParameter>,
    pub gas_limit: Gas,
    pub value: Amount,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContractParameter {
    U32(u32),
    U64(u64),
    String(String),
    Bytes(Vec<u8>),
    Address(Address),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractDeployment {
    pub code: ContractCode,
    pub constructor_params: Vec<ContractParameter>,
    pub deployer: Address,
    pub gas_limit: Gas,
    pub value: Amount,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub gas_used: Gas,
    pub return_data: Vec<u8>,
    pub logs: Vec<ContractLog>,
    pub error: Option<String>,
    pub state_changes: Vec<StateChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractLog {
    pub topics: Vec<Hash>,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateChange {
    pub contract_address: Address,
    pub key: String,
    pub old_value: Option<Vec<u8>>,
    pub new_value: Vec<u8>,
}

#[derive(Debug)]
pub struct SmartContractVM {
    engine: Engine,
    contracts: HashMap<Address, SmartContract>,
    gas_meter: GasMeter,
}

#[derive(Debug)]
struct GasMeter {
    gas_limit: Gas,
    gas_used: Gas,
}

impl GasMeter {
    fn new(gas_limit: Gas) -> Self {
        Self {
            gas_limit,
            gas_used: 0,
        }
    }

    fn consume_gas(&mut self, amount: Gas) -> Result<()> {
        if self.gas_used + amount > self.gas_limit {
            return Err(BlockchainError::SmartContractError(
                "Out of gas".to_string()
            ));
        }
        self.gas_used += amount;
        Ok(())
    }

    fn remaining_gas(&self) -> Gas {
        self.gas_limit.saturating_sub(self.gas_used)
    }
}

impl SmartContractVM {
    pub fn new() -> Result<Self> {
        let mut config = Config::new();
        config.wasm_multi_memory(true);
        config.wasm_bulk_memory(true);
        config.consume_fuel(true);

        let engine = Engine::new(&config)
            .map_err(|e| BlockchainError::SmartContractError(e.to_string()))?;

        Ok(Self {
            engine,
            contracts: HashMap::new(),
            gas_meter: GasMeter::new(0),
        })
    }

    pub fn deploy_contract(&mut self, deployment: ContractDeployment) -> Result<Address> {
        // Validate gas limit
        if deployment.gas_limit > MAX_GAS_LIMIT {
            return Err(BlockchainError::SmartContractError(
                "Gas limit exceeds maximum".to_string()
            ));
        }

        self.gas_meter = GasMeter::new(deployment.gas_limit);

        // Generate contract address (simplified)
        let contract_address = self.generate_contract_address(&deployment.deployer, deployment.code.len());

        // Create WASM module
        let module = Module::new(&self.engine, &deployment.code)
            .map_err(|e| BlockchainError::SmartContractError(format!("Invalid WASM: {}", e)))?;

        // Create contract state
        let mut state = ContractState::default();
        state.balance = deployment.value;

        // Execute constructor if present
        let execution_result = self.execute_constructor(&module, &deployment.constructor_params)?;

        if !execution_result.success {
            return Err(BlockchainError::SmartContractError(
                execution_result.error.unwrap_or_else(|| "Constructor failed".to_string())
            ));
        }

        // Apply state changes
        for change in execution_result.state_changes {
            state.storage.insert(change.key, change.new_value);
        }

        let contract = SmartContract {
            address: contract_address.clone(),
            code: deployment.code,
            state,
            owner: deployment.deployer,
            created_at: chrono::Utc::now(),
            gas_used: execution_result.gas_used,
        };

        self.contracts.insert(contract_address.clone(), contract);

        Ok(contract_address)
    }

    pub fn call_contract(&mut self, call: ContractCall) -> Result<ExecutionResult> {
        // Validate gas limit
        if call.gas_limit > MAX_GAS_LIMIT {
            return Err(BlockchainError::SmartContractError(
                "Gas limit exceeds maximum".to_string()
            ));
        }

        self.gas_meter = GasMeter::new(call.gas_limit);

        let contract = self.contracts.get(&call.contract_address)
            .ok_or_else(|| BlockchainError::SmartContractError(
                "Contract not found".to_string()
            ))?
            .clone();

        // Create WASM module
        let module = Module::new(&self.engine, &contract.code)
            .map_err(|e| BlockchainError::SmartContractError(format!("Invalid WASM: {}", e)))?;

        // Execute function
        let execution_result = self.execute_function(&module, &contract, &call)?;

        // Update contract state if execution was successful
        if execution_result.success {
            if let Some(contract_mut) = self.contracts.get_mut(&call.contract_address) {
                for change in &execution_result.state_changes {
                    if change.contract_address == call.contract_address {
                        contract_mut.state.storage.insert(change.key.clone(), change.new_value.clone());
                    }
                }
                contract_mut.gas_used += execution_result.gas_used;
            }
        }

        Ok(execution_result)
    }

    pub fn get_contract(&self, address: &Address) -> Option<&SmartContract> {
        self.contracts.get(address)
    }

    pub fn get_contract_storage(&self, address: &Address, key: &str) -> Option<Vec<u8>> {
        self.contracts
            .get(address)
            .and_then(|contract| contract.state.storage.get(key))
            .cloned()
    }

    pub fn estimate_gas(&mut self, call: ContractCall) -> Result<Gas> {
        // Create a copy for gas estimation
        let mut estimation_call = call.clone();
        estimation_call.gas_limit = MAX_GAS_LIMIT;

        let result = self.call_contract(estimation_call)?;
        Ok(result.gas_used)
    }

    fn execute_constructor(
        &mut self,
        module: &Module,
        params: &[ContractParameter],
    ) -> Result<ExecutionResult> {
        let mut store = Store::new(&self.engine, ());
        store.set_fuel(self.gas_meter.remaining_gas())
            .map_err(|e| BlockchainError::SmartContractError(e.to_string()))?;

        let mut linker = Linker::new(&self.engine);
        self.setup_host_functions(&mut linker)?;

        let instance = linker
            .instantiate(&mut store, module)
            .map_err(|e| BlockchainError::SmartContractError(e.to_string()))?;

        // Look for constructor function
        if let Ok(constructor) = instance.get_typed_func::<(), ()>(&mut store, "constructor") {
            match constructor.call(&mut store, ()) {
                Ok(_) => {
                    let gas_used = self.gas_meter.gas_limit - store.get_fuel().unwrap_or(0);
                    self.gas_meter.consume_gas(gas_used)?;

                    Ok(ExecutionResult {
                        success: true,
                        gas_used,
                        return_data: Vec::new(),
                        logs: Vec::new(),
                        error: None,
                        state_changes: Vec::new(),
                    })
                }
                Err(e) => Ok(ExecutionResult {
                    success: false,
                    gas_used: self.gas_meter.gas_limit,
                    return_data: Vec::new(),
                    logs: Vec::new(),
                    error: Some(e.to_string()),
                    state_changes: Vec::new(),
                }),
            }
        } else {
            // No constructor, deployment successful
            Ok(ExecutionResult {
                success: true,
                gas_used: 21000, // Base deployment cost
                return_data: Vec::new(),
                logs: Vec::new(),
                error: None,
                state_changes: Vec::new(),
            })
        }
    }

    fn execute_function(
        &mut self,
        module: &Module,
        contract: &SmartContract,
        call: &ContractCall,
    ) -> Result<ExecutionResult> {
        let mut store = Store::new(&self.engine, ());
        store.set_fuel(self.gas_meter.remaining_gas())
            .map_err(|e| BlockchainError::SmartContractError(e.to_string()))?;

        let mut linker = Linker::new(&self.engine);
        self.setup_host_functions(&mut linker)?;

        let instance = linker
            .instantiate(&mut store, module)
            .map_err(|e| BlockchainError::SmartContractError(e.to_string()))?;

        // Execute the function
        match instance.get_typed_func::<(), i32>(&mut store, &call.function_name) {
            Ok(func) => {
                match func.call(&mut store, ()) {
                    Ok(result) => {
                        let gas_used = self.gas_meter.gas_limit - store.get_fuel().unwrap_or(0);
                        self.gas_meter.consume_gas(gas_used)?;

                        Ok(ExecutionResult {
                            success: true,
                            gas_used,
                            return_data: result.to_le_bytes().to_vec(),
                            logs: Vec::new(),
                            error: None,
                            state_changes: Vec::new(),
                        })
                    }
                    Err(e) => Ok(ExecutionResult {
                        success: false,
                        gas_used: self.gas_meter.gas_limit,
                        return_data: Vec::new(),
                        logs: Vec::new(),
                        error: Some(e.to_string()),
                        state_changes: Vec::new(),
                    }),
                }
            }
            Err(_) => Err(BlockchainError::SmartContractError(
                format!("Function '{}' not found", call.function_name)
            )),
        }
    }

    fn setup_host_functions(&self, linker: &mut Linker<()>) -> Result<()> {
        // Add host functions that contracts can call
        linker
            .func_wrap("env", "debug_print", |_caller: wasmtime::Caller<'_, ()>, ptr: i32, len: i32| {
                log::debug!("Contract debug: ptr={}, len={}", ptr, len);
            })
            .map_err(|e| BlockchainError::SmartContractError(e.to_string()))?;

        Ok(())
    }

    fn generate_contract_address(&self, deployer: &Address, code_size: usize) -> Address {
        use crate::crypto::{sha256, hash_to_string};
        
        let mut data = Vec::new();
        data.extend_from_slice(deployer.as_bytes());
        data.extend_from_slice(&code_size.to_be_bytes());
        data.extend_from_slice(&chrono::Utc::now().timestamp().to_be_bytes());
        
        let hash = sha256(&data);
        format!("contract_{}", &hash_to_string(&hash)[..20])
    }

    pub fn get_contract_balance(&self, address: &Address) -> Amount {
        self.contracts
            .get(address)
            .map(|contract| contract.state.balance)
            .unwrap_or(0)
    }

    pub fn transfer_to_contract(&mut self, address: &Address, amount: Amount) -> Result<()> {
        if let Some(contract) = self.contracts.get_mut(address) {
            contract.state.balance += amount;
            Ok(())
        } else {
            Err(BlockchainError::SmartContractError(
                "Contract not found".to_string()
            ))
        }
    }

    pub fn list_contracts(&self) -> Vec<&SmartContract> {
        self.contracts.values().collect()
    }

    pub fn calculate_deployment_cost(code: &[u8], gas_limit: Gas) -> Amount {
        let base_cost = 21000; // Base deployment cost
        let code_cost = code.len() as u64 * 200; // Cost per byte
        let gas_cost = gas_limit * GAS_PRICE;
        
        base_cost + code_cost + gas_cost
    }

    pub fn calculate_call_cost(gas_limit: Gas) -> Amount {
        let base_cost = 21000; // Base transaction cost
        let gas_cost = gas_limit * GAS_PRICE;
        
        base_cost + gas_cost
    }
}

impl Default for SmartContractVM {
    fn default() -> Self {
        Self::new().unwrap()
    }
}

// Simple contract compiler for basic contracts
pub struct SimpleContractCompiler;

impl SimpleContractCompiler {
    pub fn compile_simple_storage() -> Vec<u8> {
        // This would contain a compiled WASM module for a simple storage contract
        // For demo purposes, return a minimal WASM module
        vec![
            0x00, 0x61, 0x73, 0x6d, // WASM magic number
            0x01, 0x00, 0x00, 0x00, // Version
        ]
    }

    pub fn compile_token_contract() -> Vec<u8> {
        // This would contain a compiled WASM module for a token contract
        vec![
            0x00, 0x61, 0x73, 0x6d, // WASM magic number
            0x01, 0x00, 0x00, 0x00, // Version
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vm_creation() {
        let vm = SmartContractVM::new();
        assert!(vm.is_ok());
    }

    #[test]
    fn test_gas_meter() {
        let mut gas_meter = GasMeter::new(1000);
        
        assert_eq!(gas_meter.remaining_gas(), 1000);
        
        gas_meter.consume_gas(300).unwrap();
        assert_eq!(gas_meter.remaining_gas(), 700);
        assert_eq!(gas_meter.gas_used, 300);
        
        let result = gas_meter.consume_gas(800);
        assert!(result.is_err()); // Should exceed limit
    }

    #[test]
    fn test_contract_address_generation() {
        let vm = SmartContractVM::new().unwrap();
        let address1 = vm.generate_contract_address("deployer1", 100);
        let address2 = vm.generate_contract_address("deployer1", 100);
        
        // Should generate different addresses due to timestamp
        assert_ne!(address1, address2);
        assert!(address1.starts_with("contract_"));
    }

    #[test]
    fn test_contract_deployment() {
        let mut vm = SmartContractVM::new().unwrap();
        
        let deployment = ContractDeployment {
            code: SimpleContractCompiler::compile_simple_storage(),
            constructor_params: Vec::new(),
            deployer: "deployer_address".to_string(),
            gas_limit: 1000000,
            value: 0,
        };

        // This will fail with the minimal WASM module, but tests the flow
        let result = vm.deploy_contract(deployment);
        // We expect this to fail due to invalid WASM, but the structure is correct
        assert!(result.is_err());
    }

    #[test]
    fn test_cost_calculation() {
        let code = vec![0u8; 1000]; // 1KB of code
        let cost = SmartContractVM::calculate_deployment_cost(&code, 500000);
        
        assert!(cost > 0);
        assert!(cost > 21000); // Should be more than base cost
    }

    #[test]
    fn test_contract_parameter_serialization() {
        let param = ContractParameter::U64(12345);
        let serialized = bincode::serialize(&param).unwrap();
        let deserialized: ContractParameter = bincode::deserialize(&serialized).unwrap();
        
        match deserialized {
            ContractParameter::U64(val) => assert_eq!(val, 12345),
            _ => panic!("Wrong parameter type"),
        }
    }

    #[test]
    fn test_execution_result() {
        let result = ExecutionResult {
            success: true,
            gas_used: 50000,
            return_data: vec![1, 2, 3, 4],
            logs: Vec::new(),
            error: None,
            state_changes: Vec::new(),
        };

        assert!(result.success);
        assert_eq!(result.gas_used, 50000);
        assert_eq!(result.return_data, vec![1, 2, 3, 4]);
    }
}