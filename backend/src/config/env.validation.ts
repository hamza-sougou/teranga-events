import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUrl } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

// Only genuinely structural variables fail boot here — third-party
// integration keys (Google, PayDunya, SMTP, Sentry) deliberately stay
// optional. Those already degrade gracefully at the call site (see
// GoogleStrategy, PaydunyaProvider, EmailChannel) so local dev doesn't
// require every credential to exist — flipping this to "everything
// required" would break that established workflow.
class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
