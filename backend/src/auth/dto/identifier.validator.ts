import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// Shared "exactly one of email/phone" rule for RegisterDto and LoginDto.
// Applied as a class decorator (registerDecorator with no propertyName),
// not a property decorator on `email`/`phone` — those two carry their own
// @ValidateIf-guarded format validators (@IsEmail / @Matches), and stacking
// this constraint under the same @ValidateIf would skip it exactly when
// that property is absent, which is precisely the case (e.g. phone-only:
// email undefined) it needs to catch. Verified empirically against
// class-validator 0.14: @ValidateIf gates the property's entire decorator
// pipeline, not just the decorator it's stacked directly under.
//
// Rejects both-missing (no way to identify/authenticate the account) and
// both-present (ambiguous which identifier a login should resolve against
// — see docs/SPEC.md phone-auth step 1 plan).
export function ExactlyOneIdentifier(validationOptions?: ValidationOptions) {
  return function (target: new (...args: unknown[]) => unknown) {
    registerDecorator({
      name: 'exactlyOneIdentifier',
      target,
      propertyName: undefined as unknown as string,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const object = args.object as { email?: string; phone?: string };
          return Boolean(object.email) !== Boolean(object.phone);
        },
        defaultMessage(): string {
          return 'Provide exactly one of email or phone, not both and not neither';
        },
      },
    });
  };
}
