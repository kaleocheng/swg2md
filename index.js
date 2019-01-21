#!/usr/bin/env node

const SwaggerParser = require('swagger-parser')
const Swagmock = require('swagmock')
const Mustache = require('mustache')
const fs = require('fs')
const toc = require('markdown-toc')
const path = require('path')
const commander = require('commander')
const pkg = require('./package.json')

function getRequireBody(name, obj, result) {
    const nameset = new Set([])
    const ofKeys = ['oneOf', 'anyOf', 'allOf']

    for (let key of ofKeys) {
        if (key in obj) {
            for (let o of obj[key]) {
                let r = []
                getRequireBody('', o, r)
                result.push(r)
            }
        }
    }

    if ('type' in obj) {
        if (!nameset.has(name) && name != '') {
            result.push({
                name: name,
                description: obj.description || name,
                type: obj.type
            })
            nameset.add(name)
        }
        switch (obj.type) {
            case 'object':
                if ('properties' in obj) {
                    for (let n of Object.keys(obj.properties)) {
                        let newName = (name == '') ? n : `${name}.${n}`
                        getRequireBody(newName, obj.properties[n], result)
                    }
                }
                break
            case 'array':
                if ('items' in obj) {
                    getRequireBody(`${name}[item]`, obj.items, result)
                }
                break
        }
    }
}

async function getItems(api) {
    const items = []
    const paths = Object.keys(api.paths)
    let mockgen = Swagmock(api, {
        validated: true
    })
    for (let p of paths) {
        const methods = Object.keys(api.paths[p])
        for (let m of methods) {
            const item = {}
            const apiItem = api.paths[p][m]
            item.title = `${m} ${p}`
            item.seq = `${m}${p.replace(/\//g, '-')}`
            item.path = p
            item.method = m
            item.descripe = apiItem.summary
            item.parameters = apiItem.parameters || []
            item.requestbody = apiItem.requestBody && apiItem.requestBody.content && apiItem.requestBody.content['application/json'] && apiItem.requestBody.content['application/json'].schema || []
            item.responses = []
            for (let code of Object.keys(apiItem.responses)) {
                let r = apiItem.responses[code]
                r.code = code
                r.responsebody = apiItem.responses[code] && apiItem.responses[code].content && apiItem.responses[code].content['application/json'] && apiItem.responses[code].content['application/json'].schema || []
                item.responses.push(r)
            }

            items.push(item)
        }
    }


    for (let item of items) {
        let bodyItems = []
        getRequireBody('', item.requestbody, bodyItems)
        if (!Array.isArray(bodyItems[0])) {
            item.requestbody = []
            item.requestbody.push(bodyItems)
        } else {
            item.requestbody = bodyItems
        }


        for (let r of item.responses) {
            let bodyItems = []
            getRequireBody('', r.responsebody, bodyItems)
            if (!Array.isArray(bodyItems[0])) {
                r.responsebody = []
                r.responsebody.push(bodyItems)
            } else {
                r.responsebody = bodyItems
            }
            r.responseMock = []
            mock = await mockgen.responses({
                path: item.path,
                operation: item.method,
                response: r.code
            })
            if (mock) {
                r.responseMock.push(JSON.stringify(mock.responses, null, 2))
            }
        }

    }
    return items
}


commander
    .version(pkg.version)
    .option('-t, --template <template>', 'The doc template')
    .option('-s, --swagger <swagger>', 'The swagger file')
    .option('-o, --output [output]', 'The output file')
    .parse(process.argv)

if (!commander.template || !commander.swagger) {
    console.log('need both -t and -s')
    process.exit(0)
}

function main() {
    SwaggerParser.validate(commander.swagger, async function (err, api) {
        if (err) {
            console.error(err)
        } else {
            const items = await getItems(api)
            const doc = fs.readFileSync(commander.template, 'utf8')
            const template = fs.readFileSync(path.join(__dirname, 'template.mustache'), 'utf8')
            const templateOutput = Mustache.render(template, items);
            const docOutput = doc.replace(/<!--function detailed design-->/g, templateOutput)
            const output = `${toc(docOutput).content}\n${docOutput}`
            if (commander.output) {
                fs.writeFileSync(commander.output, output)
            } else {
                console.log(output)
            }
        }
    })
}

main()
