import fs from 'fs';
import path from 'path';
import recursive from 'recursive-readdir';

const appKeys = require('./translations/appKeys.json');

function writeFile(file, content) {
    const p = path.join(process.cwd(), file)
    fs.existsSync(path.dirname(p)) || fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
}

const getAllFilesContent = async () => {
    const ignoreNodeModules = (f, s) => s.isDirectory() && f === 'node_modules';
    const ignoreNotJSFiles = (f, s) => s.isFile() && !f.endsWith('.js');
    const ignoreTranslateDBFile = (f, s) => s.isFile() && f === 'translateDB.js';
    return recursive('./', [ignoreNodeModules, ignoreNotJSFiles, ignoreTranslateDBFile])
}

const addOccToJson = (match, file, i) => {
    if (match.search(/[\u0590-\u05FF]/) > -1) {
        const fileName = file.replace(/.*\\|\.*$/g, '');
        const val = match.substr(1, match.length - 2)
        if (!appKeys[val])
            appKeys[val] = {
                key: 'key',
                en: 'en',
                occ: []
            };
        if (appKeys[val].occ.indexOf(`${fileName}.${i}`) < 0)
            appKeys[val].occ.push(`${fileName}.${i}`);
    }
}

const exportToJson = async () => {
    const files = await getAllFilesContent();
    files.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        if (content.search(/[\u0590-\u05FF]/) > -1) {
            const matches = content.match(/"(.*?)[^\\]"|'(.*?)'|`(.*?)`/g);
            matches && matches.forEach((match, i) => addOccToJson(match, file, i));
        }
    });
    writeFile('./translations/appKeys.json', JSON.stringify(appKeys));
}

const updateFilesWithKeys = async () => {
    const files = await getAllFilesContent();
    files.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        if (content.search(/[\u0590-\u05FF]/) > -1) {
            const matches = content.match(/"(.*?)[^\\]"|'(.*?)'|`(.*?)`/g);
            matches && matches.forEach((match, i) => {
                const val = match.substr(1, match.length - 2);
                if (appKeys[val])
                content= content.replace(match, `translate('${appKeys[val].key}', lang)`);
            });
        }
        writeFile(file, content);
    })
}

const generateEnHeFiles = () => {
    const he = {};
    const en = {};
    Object.keys(appKeys).forEach(k => {
        he[appKeys[k].key] = k;
        en[appKeys[k].key] = appKeys[k].en;
    });
    writeFile('./translations/he.json', JSON.stringify(he));
    writeFile('./translations/en.json', JSON.stringify(en));
}


/*  Steps:
        1. Call exportToJson
        2. Update appKeys.json file according to the output
        3. Call generateEnHeFiles to create en\he.json files according to the updated appKeys file
        4. Call updateFilesWithKeys to change all static words in files to the correct key
        5. Add translateService to each changed file
        5. Pass language foreach changed function */


        updateFilesWithKeys()