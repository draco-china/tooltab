export class DeveloperParserError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DeveloperParserError";
  }
}
