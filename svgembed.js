#!/usr/bin/env node
/* eslint-disable camelcase */
const fs = require('fs');
const path = require('path');

const VALID_ARGS = [
  {
    short: 'i',
    long: 'input',
    value: true,
    expected: true,
    required: true,
    description: 'the input SVG file',
    transform(inputfile) {
      if (!(fs.existsSync(inputfile) && fs.statSync(inputfile).isFile()))
        throw new Error('<inputfile> should be an existent file');
      return inputfile;
    },
  },
  {
    short: 'o',
    long: 'output',
    value: true,
    expected: true,
    required: true,
    description: 'the output file name',
    transform(outputfile, args) {
      if (fs.existsSync(outputfile)) {
        if (!args.includes('--overwrite')) throw new Error('<outputfile> exists. use the `--overwrite` flag to overwrite');
        if (!fs.statSync(outputfile).isFile())
          throw new Error('<outputfile> cannot be replaced, not a file, please remove manually');
      }
      return outputfile;
    },
  },
  {
    short: 'f',
    long: 'font',
    value: true,
    expected: true,
    required: false,
    description: 'fontfile to be embedded (otf/ttf)',
    transform(fontfile) {
      if (!['ttf', 'otf'].some(ext => fontfile.endsWith(ext)))
        throw new Error('Please provide a valid font file to be embedded (ttf / otf)');
      if (!(fs.existsSync(fontfile) && fs.statSync(fontfile).isFile())) throw new Error('<fontfile> should be an existent file');
      return fontfile;
    },
  },
  {
    short: 't',
    long: 'title',
    value: true,
    expected: false,
    required: false,
    default: 'Terminal',
    description: 'set terminal window title',
    transform(title) {
      return title === true ? 'Terminal' : title;
    },
  },
  {
    short: 'r',
    long: 'right',
    value: false,
    expected: false,
    required: false,
    description: 'use right-sided window icons',
  },
  {
    short: 'v',
    long: 'hover',
    value: false,
    expected: false,
    required: false,
    description: 'dim window icons on hover',
  },
  {
    long: 'overwrite',
    value: false,
    expected: false,
    required: false,
    description: 'overwrite existing output',
  },
  {
    short: '-h',
    long: 'help',
    value: false,
    expected: false,
    required: false,
    description: 'output usage information',
  },
];

function parseArgs(args) {
  // make a raw copy of args for the transforms
  const raw_args = args.slice(0);
  // make a morphing copy of args
  args = args.slice(0);
  // create a result object. default to undefined for flags that expect a value and false otherwise
  const result = {
    _: [],
    args: VALID_ARGS.reduce((stack, arg) => ((stack[arg.long] = arg.expected && arg.value ? undefined : false), stack), {}),
  };
  // match -a or --help
  const REGEX = /^(?:-([^-])$)|(?:--(.+)$)/;
  // pick first value from args and check to be existent
  let item;
  while ((item = args.shift()) !== undefined) {
    let match;
    if ((match = item.match(REGEX))) {
      // extract the argument object from VALID_ARGS that matches the flag tag i.e `h` in `-h` or `help` in `--help`
      const arg_object = VALID_ARGS.find(arg => [arg.long, arg.short].includes(match[1] || match[2]));
      if (!arg_object) throw new Error(`CLI argument ${match[0]} is invalid`);
      // default to arg_object's default value or true
      let value = arg_object.default || true;
      // if expected, check and extract the next non-flaglike item in the args
      if (
        arg_object.value &&
        !((args[0] !== undefined && !REGEX.test(args[0]) && (value = args.shift()) !== undefined) || !arg_object.expected)
      )
        throw new Error(`CLI argument ${match[0]} expects a value`);
      result.args[arg_object.long] = typeof arg_object.transform === 'function' ? arg_object.transform(value, raw_args) : value;
    }
    // push all unmatched values to the _ array
    else result._.push(item);
  }
  let unmatched_requirement;
  // check for unmatched requirements
  if ((unmatched_requirement = VALID_ARGS.find(arg => arg.required && result.args[arg.long] === undefined)))
    throw new Error(`CLI requirement was not specified --${unmatched_requirement.long}`);
  return result;
}

function handleHelp() {
  const strict_len = (f, c) => (
    (c = Math.min(c, f.length)), [...Array(Math.ceil(f.length / c || 1))].map((_, i) => f.slice(i * c, i * c + c))
  );
  const credits = `svgembed (c) 2020 Miraculous Owonubi <omiraculous@gmail.com>`;
  console.log(credits);
  console.log('-'.repeat(credits.length));
  console.log(`Usage: svgembed [options]\n`);
  console.log(`Options`);
  const blocks = VALID_ARGS.map(arg => [
    [arg.short ? `-${arg.short}` : '', arg.long ? `--${arg.long}` : '']
      .filter(Boolean)
      .join(', ')
      .concat(arg.value ? (value => ` ${arg.expected ? '<' : '['}${value}${arg.expected ? '>' : ']'}`)('VALUE') : ''),
    arg.description,
    arg.default,
  ]);
  const longest_flag_block = Math.max(...blocks.map(([flag]) => flag.length));
  blocks.forEach(([flag, desc, def]) => {
    (desc || '')
      .split('\n')
      .flatMap(line => strict_len(line, Math.floor(process.stdout.columns / 2)))
      .forEach((line, index) => {
        console.log(
          `  ${(index === 0 ? flag : '').padEnd(longest_flag_block, ' ')}`,
          line.trim().concat(index === 0 && def ? ` (default: ${JSON.stringify(def)})` : ''),
        );
      });
  });
}

// left side [viewBox="0 0 -820 472.49"] [20 40 60]
// right side [viewBox="-820 0 820 472.49"] [-20 -40 -60]

function insertTitleAndPositionIcons(file, args) {
  // match the first <rect><svg></svg> to extract data from
  return file.replace(/<rect.+\/><svg.+?<\/svg>/, full => {
    // extract the terminal dimensions
    const size_match = full.match(/width=["'](.+?)["'] height=["'](.+?)["']/);
    const [, width, height] = size_match || [];
    return (
      full
        // move the window icons
        .replace(
          /(?<=<circle.+?cx=")(.+?)(?=".*?\/>)/g,
          val => `${args.right ? -val : val}${args.hover ? '" class="winicons' : ''}`,
        )
        // strip up the SVG tag
        .replace(/(<rect.*?><svg.+?)>/, (_all, match) => {
          match = match
            // insert a viewBox for control
            .concat(width ? ` viewBox="${(args.right ? [-width, 0, width, height] : [0, 0, -width, height]).join(' ')}"` : '')
            // close the SVG tag
            .concat('>');
          if (args.title)
            match = match
              // embed stylesheet for the title header
              .concat(
                `<style>.frametitle{fill:grey;font-size:medium;${args.font ? 'font-family:"CUSTOMFONT";' : ''}}${
                  args.hover ? `.winicons:hover{fill-opacity:0.5;transition:all 0s ease;}` : ''
                }</style>`,
              )
              // embed a text tag for the title
              .concat(
                `<text y="30" x="${
                  args.right ? '-' : ''
                }50%" class="frametitle" dominant-baseline="middle" text-anchor="middle">${args.title}</text>`,
              );
          return match;
        })
    );
  });
}

function embedFont(file, args) {
  if (args.font)
    file = file
      // prepend the custom font to every font-family field
      .replace(/(?<=font-family=['"])/g, 'CUSTOMFONT,')
      // embed the font file in base64 format
      .replace(
        /(?=<rect)/,
        `<style>@font-face{font-family:"CUSTOMFONT";src:url('data:application/x-font-${path
          .extname(args.font)
          .slice(1)};base64,${fs.readFileSync(args.font).toString('base64')}');}</style>`,
      );
  return file;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || ['-h', '--help'].some(form => argv.includes(form))) handleHelp(), process.exit(1);
  let args;
  try {
    ({args} = parseArgs(argv));
  } catch (e) {
    console.error(`\x1b[31m[!]\x1b[0m ${e}`);
    process.exit(1);
  }
  let file = fs.readFileSync(args.input).toString();
  file = insertTitleAndPositionIcons(file, args);
  // embed the font file last to avoid modifying the font
  file = embedFont(file, args);
  fs.writeFileSync(args.output, file);
}

module.exports = {insertTitleAndPositionIcons, embedFont};

if (require.main === module) main();
