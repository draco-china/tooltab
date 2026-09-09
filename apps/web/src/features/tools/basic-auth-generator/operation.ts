import {
  createBasicAuthCurlCommand,
  createBasicAuthHeader,
} from "@workspace/tools/encoding/basic-auth";

export const BASIC_AUTH_EXAMPLE_URL = "https://api.example.com/protected";

export function generateBasicAuth(
  username: string,
  password: string,
  url = BASIC_AUTH_EXAMPLE_URL,
) {
  const authorization = createBasicAuthHeader(username, password);
  return {
    authorization,
    curl: createBasicAuthCurlCommand(url, username, password),
  };
}
