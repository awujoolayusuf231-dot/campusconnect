import { handleProcessOutbox } from "../_shared/processOutbox.ts";

Deno.serve(handleProcessOutbox);
