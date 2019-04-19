#!/usr/bin/env node

const SwaggerParser = require('swagger-parser')
const Mustache = require('mustache')
const fs = require('fs')


function getFlatJSONSchema(name, jsonSchema, flatedJSONSchema) {
    let result = []
    flatJSONSchema(name, jsonSchema, flatedJSONSchema)
    if (!Array.isArray(flatedJSONSchema[0])) {
        result.push(flatedJSONSchema)
    } else {
        result = flatedJSONSchema
    }
    return result
}

function flatJSONSchema(name, jsonSchema, flatedJSONSchema) {
    const nameset = new Set([])
    const schemaOfKeys = ['oneOf', 'anyOf', 'allOf']
    for (let key of schemaOfKeys) {
        if (key in jsonSchema) {
            for (let body of jsonSchema[key]) {
                let r = []
                flatJSONSchema('', body, r)
                flatedJSONSchema.push(r)
            }
        }
    }

    if (!('type' in jsonSchema)) {
        jsonSchema.type = 'object'
    }

    if (!nameset.has(name) && name != '') {
        flatedJSONSchema.push({
            name: name,
            description: jsonSchema.description || name,
            type: jsonSchema.format || jsonSchema.type
        })
        nameset.add(name)
    }

    switch (jsonSchema.type) {
        case 'object':
            if ('properties' in jsonSchema) {
                for (let n of Object.keys(jsonSchema.properties)) {
                    let newName = (name == '') ? n : `${name}.${n}`
                    flatJSONSchema(newName, jsonSchema.properties[n], flatedJSONSchema)
                }
            }
            break
        case 'array':
            if ('items' in jsonSchema) {
                flatJSONSchema(`${name}[item]`, jsonSchema.items, flatedJSONSchema)
            }
            break
    }
}

function flatRequestBody(requestBody) {
    const flatedJSONSchema = []
    const jsonSchema = requestBody.content && requestBody.content['application/json'] && requestBody.content['application/json'].schema || []
    getFlatJSONSchema('', jsonSchema, flatedJSONSchema)
    requestBody.flatedJSONSchema = flatedJSONSchema
    return requestBody
}

function flatResponses(responses) {
    const fr = []
    for (let code of Object.keys(responses)) {
        let flatedJSONSchema = []
        let r = responses[code]
        r.code = code
        let jsonSchema = responses[code].content && responses[code].content['application/json'] && responses[code].content['application/json'].schema || []
        getFlatJSONSchema('', jsonSchema, flatedJSONSchema)
        r.responseBody = flatedJSONSchema
        fr.push(r)
    }
    return fr
}

function transForMD(api) {
    const items = []

    const paths = Object.keys(api.paths)
    for (let p of paths) {
        const methods = Object.keys(api.paths[p])
        for (let m of methods) {
            const item = api.paths[p][m]
            item.title = `${m} ${p}`
            item.path = p
            item.method = m
            item.methodUpperCase = m.toUpperCase()
            item.flatedRequestBody = flatRequestBody(item.requestBody || {})
            item.flatedResponses = flatResponses(item.responses || {})
            items.push(item)
        }
    }
    api.flatPaths = items
    return api
}

async function render(swaggerFile, option) {
    const tf = option && option.templateFile || require.resolve("./template.mustache")
    const api = await SwaggerParser.validate(swaggerFile)
    const items = await transForMD(api)
    const template = fs.readFileSync(tf, 'utf8')
    return Mustache.render(template, items);
}

module.exports = {
    render: render
}
