import typescript from "typescript-legacy";

// Vite otherwise identifies the npm alias by its package name ("typescript")
// and folds it into the incompatible TypeScript 7 compiler dependency.
export default typescript;
