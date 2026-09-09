import cronstrue from "cronstrue";
import "cronstrue/locales/zh_CN";
import {
  buildExpression,
  CronToolError,
  inspectCron as inspectExpression,
  normalizeCronExpression,
  type CronForm,
  type CronOptions as ExpressionOptions,
} from "@workspace/tools/time/cron";

export type CronOptions = ExpressionOptions & { locale: "zh-CN" | "en-US" };

export function inspectCron(input: string, options: CronOptions) {
  if (!["en-US", "zh-CN"].includes(options.locale)) {
    normalizeCronExpression(input);
    throw new CronToolError("invalid_options");
  }
  const result = inspectExpression(input, options);
  let description: string | null = null;
  try {
    description = cronstrue.toString(result.resolved, {
      locale: options.locale === "zh-CN" ? "zh_CN" : "en",
      use24HourTimeFormat: true,
      logicalAndDayFields: false,
      throwExceptionOnParseError: true,
    });
  } catch {}
  return { ...result, description };
}

export function generateCron(form: CronForm, options: CronOptions) {
  return inspectCron(buildExpression(form), options);
}
