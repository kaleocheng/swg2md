#!/usr/bin/env node

const swg2md = require('../index.js')
const toc = require('markdown-toc')
const path = require('path')
const commander = require('commander')
const pkg = require('../package.json')

async function main() {
    commander
        .version(pkg.version)
        .option('-t, --template <template>', 'The doc template')
        .option('--without-toc', 'Without table of contents')
        .option('-s, --swagger <swagger>', 'The swagger file')
        .option('-o, --output [output]', 'The output file')
        .parse(process.argv)

    if (!commander.swagger) {
        console.log('need both and -s')
        process.exit(0)
    }

    const swaggerFile = commander.swagger
    const templateOutput = await swg2md.render(swaggerFile, { templateFile: commander.template })
    let output = ''
    if (commander.withoutToc) {
        output = `${templateOutput}`
    } else {
        output = `${toc(templateOutput).content}\n${templateOutput}`
    }
    if (commander.output) {
        fs.writeFileSync(commander.output, output)
    } else {
        console.log(output)
    }
}

main()
