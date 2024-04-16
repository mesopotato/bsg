const puppeteer = require('puppeteer');

async function navigateAndExtractText(page, url) {
    await page.goto(url, { waitUntil: 'networkidle0' });

    const data = {};  // Object to hold all extracted data

    async function extractText(selector) {
        try {
            await page.waitForSelector(selector, { visible: true, timeout: 3000 });
            return await page.$eval(selector, el => el.textContent.trim());
        } catch (error) {
            console.log(`No element found for selector: ${selector}`);
            return null;  // Return null if element is not found
        }
    }

    // Extract main elements
    data.systematic_number = await extractText('.systematic_number');
    data.title = await extractText('.title');
    data.abbreviation = await extractText('.abbreviation');
    data.enactment = await extractText('.enactment');
    data.ingress_author = await extractText('.ingress_author');
    data.ingress_foundation = await extractText('.ingress_foundation');
    data.ingress_action = await extractText('.ingress_action');

    // Extract information from each 'type-article' element
    data.articles = await page.$$eval('.type-article', articles => {
        return articles.map(article => {
            const article_number = article.querySelector('.article_number') ? article.querySelector('.article_number').textContent.trim() : null;
            const article_title = article.querySelector('.article_title') ? article.querySelector('.article_title').textContent.trim() : null;
            return { article_number, article_title };
        });
    });

    // print each article.number and article.title
    for (let article of data.articles) {
        console.log(`Article Number: ${article.article_number}`);
        console.log(`Article Title: ${article.article_title}`);
    }

    return data;  // Return all extracted data as an object
}

async function navigateAndExtract() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto('https://www.belex.sites.be.ch/app/de/systematic/texts_of_law', { waitUntil: 'networkidle2' });

        const selectorToClick = '#page-content > ng-component > ng-component > div > clex-tree > div > p > a:nth-child(1)';
        await page.waitForSelector(selectorToClick, { visible: true });
        await page.evaluate(selector => {
            const element = document.querySelector(selector);
            element.scrollIntoView();
        }, selectorToClick);

        await page.click(selectorToClick);
        console.log("Clicked the expand link.");

        await page.waitForSelector('clex-tree-node', { visible: true });

        const links = await page.$$eval('clex-tree-node a', anchors => anchors.map(anchor => ({
            text: anchor.textContent.trim(),
            href: anchor.href
        })));

        if (links.length === 0) {
            console.log('No links found within <clex-tree-node>.');
        } else {
            console.log(`Found ${links.length} links within <clex-tree-node>.`);
            for (let link of links) {
                console.log(`Navigating to link: ${link.href}`);
                const data = await navigateAndExtractText(page, link.href);
                
            }
        }
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
    }
}

navigateAndExtract();
