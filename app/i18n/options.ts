import type { InitOptions } from "i18next";
import { baseI18nOptions } from "./base-options";
import { resources } from "./resources";

/** The server's i18next options (and the tests'): the shared base plus every shipped language. Never import this in the browser. */
export const i18nOptions = {
  ...baseI18nOptions,
  resources,
} satisfies InitOptions;
