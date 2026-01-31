const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

export function info(msg) { console.log(`${CYAN}[info]${RESET} ${msg}`); }
export function success(msg) { console.log(`${GREEN}[ok]${RESET}   ${msg}`); }
export function warn(msg) { console.log(`${YELLOW}[warn]${RESET} ${msg}`); }
export function error(msg) { console.error(`${RED}[err]${RESET}  ${msg}`); }
export function dim(msg) { console.log(`${DIM}${msg}${RESET}`); }
