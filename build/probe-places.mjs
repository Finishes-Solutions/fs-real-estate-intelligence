// Runs the places loader (build/places.mjs) from "Probe services" with script=places, for a branch whose Places
// workflow isn't on the default branch yet (GitHub only dispatches workflows that exist there).
import { main } from './places.mjs';
await main();
