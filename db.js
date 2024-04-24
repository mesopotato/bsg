const mysql = require('mysql');
require('dotenv').config(); // Load environment variables from .env file

class Database {
    constructor() {
        this.connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        this.connect();
    }

    connect() {
        this.connection.connect(err => {
            if (err) {
                console.error('Error connecting to the database: ' + err.stack);
                return;
            }
            console.log('Connected to database with thread ID: ', this.connection.threadId);
        });
    }

    createTables() {
        const createLawTextBernTable = `
            CREATE TABLE IF NOT EXISTS lawtext_bern (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                INSERT_TSD TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                systematic_number VARCHAR(255),
                title TEXT,
                abbreviation VARCHAR(255),
                enactment TEXT,
                ingress_author TEXT,
                ingress_foundation TEXT,
                ingress_action TEXT, 
                source_url TEXT
            )`;

        const createLawTextBernHistoryTable = `
            CREATE TABLE IF NOT EXISTS lawtext_bern_history  (
                ID INT ,
                INSERT_TSD TIMESTAMP,
                systematic_number VARCHAR(255),
                title VARCHAR(255),
                abbreviation VARCHAR(255),
                enactment VARCHAR(255),
                ingress_author VARCHAR(255),
                ingress_foundation VARCHAR(255),
                ingress_action VARCHAR(255), 
                source_url TEXT,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            )`;            

        const createArticlesBernTable = `
            CREATE TABLE IF NOT EXISTS articles_bern (
                id INT AUTO_INCREMENT PRIMARY KEY,
                INSERT_TSD TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                systematic_number VARCHAR(255),
                abbreviation VARCHAR(255),
                book_name TEXT,
                part_name text,
                title_name TEXT,
                sub_title_name TEXT,
                chapter_name TEXT,
                sub_chapter_name TEXT,
                section_name TEXT,
                sub_section_name TEXT,
                article_number VARCHAR(255),
                article_title TEXT,
                paragraph_number VARCHAR(255),
                paragraph_text MEDIUMTEXT
            )`;

        const createArticlesBernHistoryTable = `
            CREATE TABLE IF NOT EXISTS articles_bern_history (
                id INT ,
                INSERT_TSD TIMESTAMP,
                systematic_number VARCHAR(255),
                abbreviation VARCHAR(255),
                book_name TEXT,
                part_name text,
                title_name TEXT,
                sub_title_name TEXT,
                chapter_name TEXT,
                sub_chapter_name TEXT,
                section_name TEXT,
                sub_section_name TEXT,
                article_number VARCHAR(255),
                article_title TEXT,
                paragraph_number VARCHAR(255),
                paragraph_text MEDIUMTEXT, 
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;    

        const createErrorTableSQL = `
            CREATE TABLE IF NOT EXISTS errorLog (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srn VARCHAR(35),
                error_text MEDIUMTEXT
            )`;
    
        this.connection.query(createErrorTableSQL, (err, results, fields) => {
            if (err) {
                console.error('Error creating errorLog table:', err);
                return;
            }
            console.log('ErrorLog table created or already exists.');
        });   

        this.connection.query(createLawTextBernTable, (err, results, fields) => {
            if (err) throw err;
            console.log('lawtext_bern table created or already exists.');
        });

        this.connection.query(createArticlesBernTable, (err, results, fields) => {
            if (err) throw err;
            console.log('articles_bern table created or already exists.');
        });

        this.connection.query(createLawTextBernHistoryTable, (err, results, fields) => {
            if (err) throw err;
            console.log('lawtext_bern_history table created or already exists.');
        });

        this.connection.query(createArticlesBernHistoryTable, (err, results, fields) => {
            if (err) throw err;
            console.log('articles_bern_history table created or already exists.');
        });
    }

    dropTable(tableName) {
        const query = `DROP TABLE IF EXISTS ${mysql.escapeId(tableName)};`;
        this.connection.query(query, (err, results) => {
            if (err) {
                console.error(`Error dropping ${tableName} table: ` + err);
                return;
            }
            console.log(`${tableName} table dropped.`);
        });
    }

    insertOrUpdateLawText(data) {
        const defaults = {
            systematic_number: '', 
            title: '', 
            abbreviation: '', 
            enactment: '', 
            ingress_author: '', 
            ingress_foundation: '', 
            ingress_action: '',
            source_url: ''
        };
    
        // Fill in defaults where necessary
        const completeData = { ...defaults, ...data };
    
        return new Promise((resolve, reject) => {
            // First, check if an entry exists with the same systematic_number
            const selectQuery = `SELECT * FROM lawtext_bern WHERE systematic_number = ?`;
            this.connection.query(selectQuery, [completeData.systematic_number], (selectErr, selectResults) => {
                if (selectErr) {
                    console.error('Error checking for existing lawtext_bern:', selectErr);
                    this.insertError(completeData.systematic_number, selectErr);
                    reject(selectErr);
                    return;
                }
    
                if (selectResults.length > 0) {
                    // Entry exists, compare and decide whether to update
                    const existingData = selectResults[0];
                    let needsUpdate = false;
                    let updateSet = [];
    
                    // Prepare an update query if necessary
                    for (let key in completeData) {
                        if (completeData[key] !== existingData[key] && completeData[key] !== '' && completeData[key] != null) {
                            needsUpdate = true;
                            updateSet.push(`${key} = ${mysql.escape(completeData[key])}`);
                        }
                    }
    
                    if (needsUpdate) {
                        // Archive existing data first
                        this.archiveLawText(existingData)
                        const updateQuery = `UPDATE lawtext_bern SET ${updateSet.join(', ')} WHERE systematic_number = ${mysql.escape(completeData.systematic_number)}`;
                        this.connection.query(updateQuery, (updateErr, updateResults) => {
                            if (updateErr) {
                                console.error('Error updating lawtext_bern:', updateErr);
                                this.insertError(completeData.systematic_number, updateErr);
                                reject(updateErr);
                            } else {
                                console.log(`lawtext_bern updated : ${existingData.title}`);
                                resolve(updateResults);
                            }
                        });
                        
                    } else {
                        console.log('No update needed');
                        resolve({ message: 'No update needed', ...existingData });
                    }
                } else {
                    // No existing entry, insert new
                    const insertQuery = `INSERT INTO lawtext_bern (systematic_number, title, abbreviation, enactment, ingress_author, ingress_foundation, ingress_action, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                    this.connection.query(insertQuery, Object.values(completeData), (insertErr, insertResults) => {
                        if (insertErr) {
                            console.error('Error inserting new lawtext_bern:', insertErr);
                            this.insertError(completeData.systematic_number, insertErr);
                            reject(insertErr);
                        } else {
                            console.log(`lawtext_bern inserted : ${completeData.title} ID: ${insertResults.insertId}`);
                            resolve(insertResults);
                        }
                    });
                }
            });
        });
    }

    insertOrUpdateArticle(data) {
        const defaults = {
            systematic_number: '',
            abbreviation: '',
            book_name: '',
            part_name: '',
            title_name: '',
            sub_title_name: '',
            chapter_name: '',
            sub_chapter_name: '',
            section_name: '',
            sub_section_name: '',
            article_number: '',
            article_title: '',
            paragraph_number: '',
            paragraph_text: ''
        };
    
        // Fill in defaults where necessary
        const completeData = { ...defaults, ...data };
    
        return new Promise((resolve, reject) => {
            // First, check if an entry exists with the same article_number and systematic_number
            const selectQuery = `SELECT * FROM articles_bern WHERE systematic_number = ? AND book_name = ? AND part_name = ? AND title_name = ? AND sub_title_name = ? AND chapter_name = ? AND sub_chapter_name = ? AND section_name = ? AND sub_section_name = ? AND article_number = ? AND article_title = ? AND paragraph_number = ?`;
            this.connection.query(selectQuery, [completeData.systematic_number, completeData.book_name, completeData.part_name, completeData.title_name, completeData.sub_title_name, completeData.chapter_name, completeData.sub_chapter_name, completeData.section_name, completeData.sub_section_name, completeData.article_number, completeData.article_title, completeData.paragraph_number], (selectErr, selectResults) => {
                if (selectErr) {
                    console.error('Error checking for existing articles_bern:', selectErr);
                    this.insertError(completeData.article_number, selectErr);
                    reject(selectErr);
                    return;
                }
    
                if (selectResults.length > 0) {
                    // Entry exists, compare and decide whether to update
                    const existingData = selectResults[0];
                    let needsUpdate = false;
                    let updateSet = [];
    
                    // Prepare an update query if necessary
                    for (let key in completeData) {
                        if (completeData[key] !== existingData[key] && completeData[key] !== '' && completeData[key] != null) {
                            needsUpdate = true;
                            updateSet.push(`${key} = ${mysql.escape(completeData[key])}`);
                        }
                    }
    
                    if (needsUpdate) {
                        // Archive existing data first
                        this.archiveArticle(existingData);

                        const updateQuery = `UPDATE articles_bern SET ${updateSet.join(', ')} WHERE systematic_number = ${mysql.escape(completeData.systematic_number)} AND book_name = ${mysql.escape(completeData.book_name)} AND part_name = ${mysql.escape(completeData.part_name)} AND title_name = ${mysql.escape(completeData.title_name)} AND sub_title_name = ${mysql.escape(completeData.sub_title_name)} AND chapter_name = ${mysql.escape(completeData.chapter_name)} AND sub_chapter_name = ${mysql.escape(completeData.sub_chapter_name)} AND section_name = ${mysql.escape(completeData.section_name)} AND sub_section_name = ${mysql.escape(completeData.sub_section_name)} AND article_number = ${mysql.escape(completeData.article_number)} AND article_title = ${mysql.escape(completeData.article_title)} AND paragraph_number = ${mysql.escape(completeData.paragraph_number)}`;
                        this.connection.query(updateQuery, (updateErr, updateResults) => {
                            if (updateErr) {
                                console.error('Error updating articles_bern:', updateErr);
                                this.insertError(completeData.article_number, updateErr);
                                reject(updateErr);
                            } else {
                                console.log(`Article updated for article_number: ${existingData.article_number}`);
                                resolve(updateResults);
                            }
                        });
                        
                    } else {
                        console.log('No update needed');
                        resolve({ message: 'No update needed', ...existingData });
                    }
                } else {
                    // No existing entry, insert new
                    const insertQuery = `INSERT INTO articles_bern (systematic_number, abbreviation, book_name, part_name, title_name, sub_title_name, chapter_name, sub_chapter_name, section_name, sub_section_name, article_number, article_title, paragraph_number, paragraph_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    this.connection.query(insertQuery, Object.values(completeData), (insertErr, insertResults) => {
                        if (insertErr) {
                            console.error('Error inserting new article:', insertErr);
                            this.insertError(completeData.article_number, insertErr);
                            reject(insertErr);
                        } else {
                            //console.log(`New article inserted for article_number: ${completeData.article_number}`);
                            resolve(insertResults);
                        }
                    });
                }
            });
        });
    }

    archiveLawText(lawTextData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO lawtext_bern_history 
                    (ID, INSERT_TSD, systematic_number, title, abbreviation, enactment, ingress_author, ingress_foundation, ingress_action, archived_at, source_url) 
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            this.connection.query(query, [
                lawTextData.ID, 
                lawTextData.INSERT_TSD, 
                lawTextData.systematic_number, 
                lawTextData.title, 
                lawTextData.abbreviation, 
                lawTextData.enactment, 
                lawTextData.ingress_author, 
                lawTextData.ingress_foundation, 
                lawTextData.ingress_action,
                lawTextData.source_url
            ], (err, results) => {
                if (err) {
                    console.error('Error archiving law text:', err);
                    this.insertError(lawTextData.systematic_number, err);
                    reject(err);
                    return;
                }
                console.log(`Law text archived with ID: ${lawTextData.ID}`);
                resolve(results);
            });
        });
    }
    
    archiveArticle(articleData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO articles_bern_history 
                    (id, INSERT_TSD, systematic_number, abbreviation, book_name, part_name, title_name, sub_title_name, chapter_name, sub_chapter_name, section_name, sub_section_name, article_number, article_title, paragraph_number, paragraph_text, archived_at) 
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            this.connection.query(query, [
                articleData.id, 
                articleData.INSERT_TSD, 
                articleData.systematic_number, 
                articleData.abbreviation, 
                articleData.book_name, 
                articleData.part_name, 
                articleData.title_name, 
                articleData.sub_title_name, 
                articleData.chapter_name, 
                articleData.sub_chapter_name, 
                articleData.section_name, 
                articleData.sub_section_name, 
                articleData.article_number, 
                articleData.article_title, 
                articleData.paragraph_number, 
                articleData.paragraph_text
            ], (err, results) => {
                if (err) {
                    console.error('Error archiving article:', err);
                    this.insertError(articleData.systematic_number, err);
                    reject(err);
                    return;
                }
                console.log(`Article archived with ID: ${articleData.id}`);
                resolve(results);
            });
        });
    }  
    
    insertError(srn, errorText) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO errorLog (srn, error_text) VALUES (?, ?)`;
            const errorTextAsString = errorText instanceof Error ? errorText.stack : String(errorText);
            this.connection.query(query, [srn, errorTextAsString], (err, results) => {
                if (err) {
                    console.error('Error inserting into errorLog:', err);
                    reject(err);
                } else {
                    console.log(`Error logged with ID: ${results.insertId}`);
                    resolve(results);
                }
            });
        });
    }
    
    close() {
        return new Promise((resolve, reject) => {
            this.connection.end(err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
}

module.exports = Database;
