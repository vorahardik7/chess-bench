import { loadEnvConfig } from "@next/env";

let loaded = false;

export function loadBenchEnv() {
  if (loaded) return;
  loadEnvConfig(process.cwd());
  loaded = true;
}

export function envString(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function envTrimmed(name: string, fallback = "") {
  return envString(name, fallback).trim();
}
