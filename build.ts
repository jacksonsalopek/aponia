import { $ } from "bun";

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  external: ["*"],
});

await $`bunx tsc src/index.ts --declaration --emitDeclarationOnly --outDir dist`;
