using DocumentManagement.Application.Documents;
using DocumentManagement.Application.Folders;
using FluentValidation;

namespace DocumentManagement.Application;

public sealed class UpdateMetadataRequestValidator : AbstractValidator<UpdateMetadataRequest>
{
    public UpdateMetadataRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(500);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Author).MaximumLength(200);
        RuleFor(x => x.Category).MaximumLength(100);
        RuleFor(x => x.Keywords).MaximumLength(1000);
        RuleFor(x => x.Language).MaximumLength(10);
        RuleFor(x => x.Classification).IsInEnum();
    }
}

public sealed class AddCommentRequestValidator : AbstractValidator<AddCommentRequest>
{
    public AddCommentRequestValidator() => RuleFor(x => x.Content).NotEmpty().MaximumLength(2000);
}

public sealed class ShareDocumentRequestValidator : AbstractValidator<ShareDocumentRequest>
{
    private static readonly string[] PrincipalTypes = ["User", "Role", "Group"];

    public ShareDocumentRequestValidator()
    {
        RuleFor(x => x.PrincipalId).NotEmpty().MaximumLength(450);
        RuleFor(x => x.PrincipalType).Must(t => PrincipalTypes.Contains(t)).WithMessage("PrincipalType must be User, Role or Group.");
        RuleFor(x => x.AccessLevel).IsInEnum().NotEqual(Domain.Enums.AccessLevel.None);
        RuleFor(x => x.ValidTo).GreaterThan(_ => DateTime.UtcNow).When(x => x.ValidTo.HasValue);
    }
}

public sealed class CreateFolderRequestValidator : AbstractValidator<CreateFolderRequest>
{
    public CreateFolderRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).Must(n => n.IndexOfAny(['/', '\\']) < 0).WithMessage("Folder names cannot contain slashes.");
        RuleFor(x => x.Description).MaximumLength(1000);
    }
}
