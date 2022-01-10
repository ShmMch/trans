import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import recursive from 'recursive-readdir';

const appKeys = require('./appKeys.json');

const ignoreRegex = new RegExp(/^{{.*}}$/);

function writeFile(file, content) {
    const p = path.join(process.cwd(), file)
    fs.existsSync(path.dirname(p)) || fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
}

const addOccToJson = (text, fileName, key) => {
    if (text.search(/[\u0590-\u05FF]/) > -1) {
        if (!appKeys[text])
            appKeys[text] = {
                key: 'key',
                en: 'en',
                occ: []
            };
        if (appKeys[text].occ.indexOf(`${fileName}.${key}`) < 0)
            appKeys[text].occ.push(`${fileName}.${key}`);
    }
}
const generateI18key = ($, node, type) => {
    let key = ($(node).attr('class') || '').replace(' ', '_') || `${($(node.parent).attr('class') || '')
        .replace(' ', '_') || node.parent.name}`;
    key += type ? `_${type}` : ''
    return key;
}

const paramsRegexTemplate = {
    'html': /({{(?:[^{{\\]|\\}}|\\)*}})/g,
    'ts': /(${(?:[^{{\\]|\\}}|\\)*}})/g
}

function getResValueAndParams(text, fileType) {
    text = text.trim().replace(/\r?\n|\r/g, '').replace(/\s+/g, ' ');
    let params;
    if (text.search(/[\u0590-\u05FF]/) > -1) {
        const matches = text.match(paramsRegexTemplate[fileType]);
        params = matches && matches.reduce((p, match) => {
            match = match.substr(2, match.length - 4);
            p[match.match(/[^.]+$/)[0]] = match;
            text.replace(match, p[match]);
            return p
        }, {});
    }
    return { text, params }
}


function exportInnerText($, fileName) {
    $('*').contents().
        filter(function () {
            return this.type === 'text' &&
                this.parent.name !== 'mat-icon' && !$(this.parent).hasClass('material-icons') && // ignore icon names
                $(this).text().trim() !== '' && // ignore new lines and whitespace
                !ignoreRegex.test($(this).text().trim()); // ignore variable names
        }).
        each(function () {
            const key = generateI18key($, this);
            const { text } = getResValueAndParams($(this).text(), 'html');
            addOccToJson(text, fileName, key);
        });
}
function replaceInnerText($, fileName) {
    $('*').contents().
        filter(function () {
            return this.type === 'text' &&
                this.parent.name !== 'mat-icon' && !$(this.parent).hasClass('material-icons') && // ignore icon names
                $(this).text().trim() !== '' && // ignore new lines and whitespace
                !ignoreRegex.test($(this).text().trim()); // ignore variable names
        }).
        each(function () {
            const key = generateI18key($, this);
            const { text, params } = getResValueAndParams($(this).text(), 'html');
            const paramsStr= params ? `: ${JSON.stringify(params).replace(/"/g, "")}` : '';
            if (appKeys[text])
                $(this).replaceWith(`{{ '${appKeys[text].key}' | translate${paramsStr} }}`)
        });
}
function exportSpecificAttr($, fileName, attr) {
    $('*').contents().
        filter(function () {
            return $(this).attr(attr) &&
                !ignoreRegex.test($(this).attr(attr)); // ignore variable names
        }).
        each(function () {
            const key = generateI18key($, this, attr);
            const { text } = getResValueAndParams($(this).attr(attr), 'html');
            addOccToJson(text, fileName, key);
        });
}
function replaceSpecificAttr($, fileName, attr) {
    $('*').contents().
        filter(function () {
            return $(this).attr(attr) &&
                !ignoreRegex.test($(this).attr(attr)); // ignore variable names
        }).
        each(function () {
            const { text, params } = getResValueAndParams($(this).attr(attr), 'html');
            const paramsStr= params ? `: ${JSON.stringify(params).replace(/"/g, "")}` : '';
            if (appKeys[text])
                $(this).attr(attr, `{{ '${appKeys[text].key}' | translate${paramsStr} }}`)
        });
}

const processors = {
    '.ts': {
        export: (file) => {
            const content = fs.readFileSync(file, 'utf8');
            if (content.search(/[\u0590-\u05FF]/) > -1) {
                const matches = content.match(/"(.*?)[^\\]"|'(.*?)'|`(.*?)`/g);
                const fileName = file.replace(/.*\\|\.*$/g, '');
                matches && matches.forEach((match, i) => {
                    const { text } = getResValueAndParams(match.substr(1, match.length - 2), 'ts');
                    addOccToJson(text, fileName, i);
                });
            }
        },
        replace: (file) => {
            let content = fs.readFileSync(file, 'utf8');
            if (content.search(/[\u0590-\u05FF]/) > -1) {
                const matches = content.match(/"(.*?)[^\\]"|'(.*?)'|`(.*?)`/g);
                matches && matches.forEach((match, i) => {
                    const { text, params } = getResValueAndParams(match.substr(1, match.length - 2), 'ts');
                    if (appKeys[text])
                        content = content.replace(match, `this.translateService.get('${appKeys[text].key}', ${JSON.stringify(params)})`);
                });
                writeFile(file, content);
            }
        }
    },
    '.html': {
        export: (file) => {
            const $ = cheerio.load(fs.readFileSync(file, 'utf8'),
                { _useHtmlParser2: true, lowerCaseAttributeNames: false });
            const fileName = file.replace(/.*\\|\..*$/g, '');
            exportInnerText($, fileName);
            exportSpecificAttr($, fileName, 'placeholder');
            exportSpecificAttr($, fileName, 'matTooltip');
            exportSpecificAttr($, fileName, 'aria-label');
        },
        replace: (file) => {
            const $ = cheerio.load(fs.readFileSync(file, 'utf8'),
                { _useHtmlParser2: true, lowerCaseAttributeNames: false });
            const fileName = file.replace(/.*\\|\..*$/g, '');
            replaceInnerText($, fileName);
            replaceSpecificAttr($, fileName, 'placeholder');
            replaceSpecificAttr($, fileName, 'matTooltip');
            replaceSpecificAttr($, fileName, 'aria-label');
            writeFile(file, $.html({ decodeEntities: false }));
        }
    }
}

const exportToJson = async () => {
    const files = await recursive('src/', [(f, s) => s.isFile() && !f.endsWith('.html') && !f.endsWith('.ts')]);
    files.forEach(file => processors[path.extname(file)].export(file));
    writeFile('./appKeys.json', JSON.stringify(appKeys));
}

const updateFilesWithKeys = async () => {
    const files = await recursive('src/', [(f, s) => s.isFile() && !f.endsWith('.html') && !f.endsWith('.ts')]);
    files.forEach(file => processors[path.extname(file)].replace(file));
}

const generateEnHeFiles = () => {
    const he = {};
    const en = {};
    Object.keys(appKeys).forEach(k => {
        he[appKeys[k].key] = k;
        en[appKeys[k].key] = appKeys[k].en;
    });
    writeFile('./src/assets/i18n/he.json', JSON.stringify(he));
    writeFile('./src/assets/i18n/en.json', JSON.stringify(en));
}

// Attention!! some translations with params not works well...

/*  Steps:
        1. Call exportToJson
        2. Update appKeys.json file according to the output
        3. Call generateEnHeFiles to create en\he.json files according to the updated appKeys file
        4. Call updateFilesWithKeys to change all static words in files to the correct key
        5. Add dependencies if needed to ts files*/


        generateEnHeFiles()
