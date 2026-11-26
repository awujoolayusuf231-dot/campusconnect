import { handleEmailOutbox } from "../_shared/processEmailOutbox.ts";

Deno.serve(handleEmailOutbox);
