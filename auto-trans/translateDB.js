import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import config from 'config';

const translations = require('./translations/translationsKeys.json');
const translation = require('./db/translation.model');

const dev2 = "Purple_DEV2_ui-service";
const dev ="Purple_DEV_ui-service";
const devQA = "Purple_DEVQA_ui-service";
const test = 'ui-service-test';

mongoose.connect(`mongodb://172.16.2.135:27017/${devQA}?authSource=admin`, {
    user: config.mongoose.userName,
    pass: config.mongoose.password,
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const models = {
    acceptance: require('./db/acceptance.model'),
    acceptanceSummary: require('./db/acceptanceSummary.model'),
    invoice: require('./db/invoice.model'),
    invoiceSummary: require('./db/invoiceSummary.model'),
    order: require('./db/order.model'),
    orderSummary: require('./db/orderSummary.model'),
    createInvoiceConfig: require('./db/createInvoiceConfig.model'),
    editInvoiceConfig: require('./db/editInvoiceConfig.model'),
    createInvoiceTemplate: require('./db/createInvoiceTemplate.model'),
    editInvoiceTemplate: require('./db/editInvoiceTemplate.model'),
    catalogNewRow: require('./db/catalogNewRow.model'),
    orgDocType: require('./db/orgDocType.model'),
    searchObject: require('./db/searchObject.model'),
}

function writeFile(file, content) {
    const p = path.join(process.cwd(), file)
    fs.existsSync(path.dirname(p)) || fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
}

function exportToJson(o, index, name) {
    Object.keys(o).forEach(function (k) {
        if (o[k] !== null && typeof o[k] === 'object') {
            exportToJson(o[k], `${index}.${k}`, name);
        }
        if (typeof o[k] === 'array') {
            o[k].forEach(e => exportToJson((e, i), `${index}.${k}.${i}`, name));
        }
        if (typeof o[k] === 'string') {
            if (o[k].search(/[\u0590-\u05FF]/) > -1) {
                if (!translations[o[k]]) translations[o[k]] = {
                    en: 'translate',
                    key: 'key',
                    occurrences: []
                };
                if (translations[o[k]].occurrences.indexOf(`$${name}.${index}.${k}`) < 0) {
                    translations[o[k]].occurrences.push(`$${name}.${index}.${k}`);
                }
            }
        }
    });
    return o;
}

const getAllCollections = async () => {
    return Promise.all(Object.keys(models).map(async k => ({ name: k, docs: await models[k].model.find() })));
}

const exportAllToJson = () => {
    getAllCollections().then(async collections => {
        await Promise.all(collections.map(collection => Promise.all(collection.docs.map((doc, index) => {
            doc._doc = exportToJson(doc._doc, index, collection.name);
            return doc.save();
        }))))
        writeFile('./translations/translationsKeys.json', JSON.stringify(translations));
    });
}

const insertTranslations = async () => {
    const createTranslations = [];
    Object.keys(translations).forEach(tKey => {
        const d = {
            key: translations[tKey].key,
            values: [
                {
                    Language: "he",
                    Description: tKey
                },
                {
                    Language: "en",
                    Description: translations[tKey].en
                }
            ]
        }
        if (translations[tKey].orgs) {
            translations[tKey].orgs.forEach(o => {
                d.orgName = o;
                createTranslations.push(translation.model.create(d));
            });
        } else {
            createTranslations.push(translation.model.create(d));
        }
    });

    await Promise.all(createTranslations)
    console.log('insert');

}

function convertValues(o, index, name) {
    Object.keys(o).forEach(function (k) {
        if (o[k] !== null && typeof o[k] === 'object') {
            o[k] = convertValues(o[k], `${index}.${k}`, name);
        }
        if (typeof o[k] === 'array') {
            o[k] = o[k].map(e => convertValues((e, i), `${index}.${k}.${i}`, name));
        }
        if (typeof o[k] === 'string') {
            if (o[k].search(/[\u0590-\u05FF]/) > -1) {
                if (translations[o[k]])
                    o[k] = `$${translations[o[k]].key}`;
                else {
                    if (o[k] === 'סיסמת חתימה דיגטלית') {
                        o[k] = `$${translations["סיסמת חתימה דיגיטלית"].key}`;
                    }
                    else {
                        console.log(`No key ${o[k]}`)
                    }
                }
            }
        }
    });
    return o;
}

const updateConfigsWithTranslation = () => {
    getAllCollections().then(async collections => {
        try {
            await Promise.all(collections.map(collection => Promise.all(collection.docs.map((doc, index) => {
                return models[collection.name].model.updateOne({ _id: doc._id }, convertValues(doc._doc, index, collection.name));
            }))))
        }
        catch (err) {
            console.log(err);
        }
    });
}

updateConfigsWithTranslation();

/*  Steps:
        1. Change mongoose connection to your requested DB
        2. Call exportAllToJson and then update translationsKeys with new values if needed
        3. Call insertTranslations
        4. Call updateConfigsWithTranslation */
