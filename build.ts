import { $ } from "bun";

await $`rm -rf dist`;

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  external: ["*"],
});

// await $`bunx tsc src/index.ts --declaration --emitDeclarationOnly --outDir dist`;
await $`bunx tsc -p ./tsconfig.json --declaration --emitDeclarationOnly --outDir dist`;
