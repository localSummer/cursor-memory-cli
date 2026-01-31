import * as readline from 'node:readline';

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

/**
 * Interactive select menu
 * @param {Object} params
 * @param {string} params.question The question to ask
 * @param {Array<{label: string, value: any}>} params.options Options to choose from
 * @param {number} [params.defaultIndex=0] Default selected index
 * @returns {Promise<any>} The selected value
 */
export async function select({ question, options, defaultIndex = 0 }) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let selectedIndex = defaultIndex;
    
    // Normalize options
    const normalizedOptions = options.map(opt => 
      typeof opt === 'string' ? { label: opt, value: opt } : opt
    );

    // Handle non-interactive terminals
    if (!stdin.isTTY) {
      resolve(normalizedOptions[defaultIndex].value);
      return;
    }

    // Prepare stdin
    readline.emitKeypressEvents(stdin);
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();

    // Hide cursor
    stdout.write('\x1b[?25l');
    
    // Print question
    stdout.write(`${GREEN}?${RESET} ${question}\n`);

    const printOptions = () => {
      normalizedOptions.forEach((opt, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? `${CYAN}❯${RESET}` : ' ';
        const label = isSelected ? `${CYAN}${opt.label}${RESET}` : opt.label;
        
        // Clear line and print
        stdout.write(`\x1b[2K\r${prefix} ${label}\n`);
      });
    };

    printOptions();

    const cleanup = () => {
      stdout.write('\x1b[?25h'); // Show cursor
      stdin.removeListener('keypress', handleKeypress);
      if (stdin.setRawMode) stdin.setRawMode(false);
      stdin.pause();
    };

    const handleKeypress = (str, key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      if (key.name === 'return') {
        cleanup();
        
        // Clear options from screen to keep it clean
        // Move cursor up N lines
        const linesToClear = normalizedOptions.length;
        stdout.write(`\x1b[${linesToClear}A`); 
        stdout.write('\x1b[J'); // Clear everything below
        
        // Print selected summary
        const selectedLabel = normalizedOptions[selectedIndex].label;
        // Simplification: just show the main part of the label if it has description
        const shortLabel = selectedLabel.split(' - ')[0].trim();
        stdout.write(`${GREEN}✔${RESET} ${question} ${DIM}${shortLabel}${RESET}\n`);
        
        resolve(normalizedOptions[selectedIndex].value);
        return;
      }

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + normalizedOptions.length) % normalizedOptions.length;
        refresh();
      }

      if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % normalizedOptions.length;
        refresh();
      }
    };

    const refresh = () => {
      // Move cursor up N lines to redraw options
      const linesToMove = normalizedOptions.length;
      stdout.write(`\x1b[${linesToMove}A`);
      printOptions();
    };

    stdin.on('keypress', handleKeypress);
  });
}
