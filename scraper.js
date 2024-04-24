const puppeteer = require('puppeteer');
const Database = require('./db');

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

            let hierarchy = {
                book_name: '',
                part_name: '',
                title_name: '',
                sub_title_name: '',
                chapter_name: '',
                sub_chapter_name: '',
                section_name: '',
                sub_section_name: ''
            };
    
            // Navigate up to find chapter and section info
            let currentElement = article.closest('.collapsible');
            while (currentElement) {
                const prevSibling = currentElement.previousElementSibling;
                if (prevSibling && prevSibling.classList.contains('type-title')) {
                    const titleText = prevSibling.textContent.trim();
                    // Example structure to decide where to place the title
                    if (hierarchy.sub_section_name === '') {
                        hierarchy.sub_section_name = titleText;
                    } else if (hierarchy.section_name === '') {
                        hierarchy.section_name = titleText;
                    } else if (hierarchy.sub_chapter_name === '') {
                        hierarchy.sub_chapter_name = titleText;
                    } else if (hierarchy.chapter_name === '') {
                        hierarchy.chapter_name = titleText;
                    } else if (hierarchy.sub_title_name === '') {
                        hierarchy.sub_title_name = titleText;
                    } else if (hierarchy.title_name === '') {
                        hierarchy.title_name = titleText;
                    } else if (hierarchy.part_name === '') {
                        hierarchy.part_name = titleText;
                    } else if (hierarchy.book_name === '') {
                        hierarchy.book_name = titleText;
                    }
                }
                // Continue up the tree
                currentElement = currentElement.parentElement.closest('.collapsible');
            }
            
            // The next sibling of the type-article which should be 'collapsible'
            const collapsible = article.nextElementSibling;
            let paragraphs = [];

            if (collapsible && collapsible.classList.contains('collapsible')) {
                const paragraphElements = collapsible.querySelectorAll('.type-paragraph');
                paragraphElements.forEach(paragraph => {
                    const number = paragraph.querySelector('.number') ? paragraph.querySelector('.number').textContent.trim() : '';
                    // Start with the paragraph's own content and remove leading/trailing whitespace
                    
                    let textContent = paragraph.innerText.trim();
                    // remove any line feed or carriage return characters
                    textContent = textContent.replace(/[\n\r]/g, ' ');
                    let nextSibling = paragraph.nextElementSibling;

                    // Concatenate text from all siblings until the next type-paragraph
                    while (nextSibling && (!nextSibling.matches('.type-paragraph'))) {
                        textContent += '\n' + (nextSibling.innerText || '').trim();
                        nextSibling = nextSibling.nextElementSibling;
                    }

                    paragraphs.push({ number, text: textContent.trim() });
                });
            }
            
            return { article_number, article_title, paragraphs, hierarchy };
        });
    });

    // print each article.number and article.title
    /* for (let article of data.articles) {
        console.log(`Article Number: ${article.article_number}`);
        console.log(`Article Title: ${article.article_title}`);
        console.log('Hierarchy:', article.hierarchy);
        
        // print each paragraph.number and paragraph.text
        for (let paragraph of article.paragraphs) {
            console.log(`Paragraph Number: ${paragraph.number}`);
            console.log(`Paragraph Text: ${paragraph.text}`);
        }
    } */

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
                // insert into database
                lawtextData = {
                    systematic_number: data.systematic_number,
                    title: data.title,
                    abbreviation: data.abbreviation,
                    enactment: data.enactment,
                    ingress_author: data.ingress_author,
                    ingress_foundation: data.ingress_foundation,
                    ingress_action: data.ingress_action, 
                    source_url: link.href
                };

                await db.insertOrUpdateLawText(lawtextData);

                // insert each paragraph into database
                for (let article of data.articles) {
                    articleData = {
                        systematic_number: data.systematic_number,
                        abbreviation: data.abbreviation,
                        book_name: article.hierarchy.book_name,
                        part_name: article.hierarchy.part_name,
                        title_name: article.hierarchy.title_name,
                        sub_title_name: article.hierarchy.sub_title_name,
                        chapter_name: article.hierarchy.chapter_name,
                        sub_chapter_name: article.hierarchy.sub_chapter_name,
                        section_name: article.hierarchy.section_name,
                        sub_section_name: article.hierarchy.sub_section_name,
                        article_number: article.article_number,
                        article_title: article.article_title
                    };            
                    for (let paragraph of article.paragraphs) {
                        const paragraphData = {
                            ...articleData, // Spread the articleData fields
                            paragraph_number: paragraph.number,
                            paragraph_text: paragraph.text
                        };
                        /* console.log('INSERTING INTO DATABASE:');
                        console.log(paragraphData);
                        console.log('------------------------'); */
                        await db.insertOrUpdateArticle(paragraphData); 
                    }
                }

            }
        }
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
    }
}
const db = new Database();


//db.dropTable('lawtext_bern')
//db.dropTable('lawtext_bern_history')
//db.dropTable('articles_bern')
//db.dropTable('articles_bern_history')
db.createTables();

// Start the scraping process
navigateAndExtract();
