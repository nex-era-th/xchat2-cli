/*

file      : file-tool.js
brief     : works on files and csv stuff
by        : @devster
license   : public
version   : 1.0
released  : oct 31, 2025

*/

const fs = require('fs/promises');
const os = require('os')
const EOL = os.EOL;
const ftool = require('./file-tool.js')



// readf -----------------------------------------
async function readf(filename, utf8 = true) {
  try {
    const encoding = utf8 ? 'utf8' : null; // Use null for binary/Buffer
    
    // fs.readFile will return a string if encoding is set, or a Buffer if encoding is null
    const content = await fs.readFile(filename, { encoding: encoding });
    
    return content;
  } catch (error) {
    console.error(`Error reading file ${filename}: ${error.message}`);
    // Re-throw the error so the calling function can handle it
    throw error;
  }
}




// existf - get true if file exists, false if not-----------
async function existf(filename) {
  try {
    // fs.access throws an error if the file doesn't exist or is inaccessible
    await fs.access(filename);
    return true;
  } catch (error) {
    // If the error code indicates the file does not exist, return false
    if (error.code === 'ENOENT') {
      return false;
    }
    // For other errors (e.g., permissions), you might still want to log or throw
    console.warn(`File system access check failed for ${filename}: ${error.message}`);
    return false; 
  }
}




// writef -- write text/binay to file---------------------
async function writef(filename, content, utf8 = true) {
  let encoding = null;
  let dataToWrite = content; // Start with the original content

  if (utf8) {
    // 1. UTF-8 Mode: Set encoding and ensure content is a string.
    encoding = 'utf8';
    if (typeof content !== 'string') {
      dataToWrite = String(content); // Convert content to a string
    }
  } else {
    // 2. Binary Mode: Content MUST be a Buffer (or similar).
    if (!Buffer.isBuffer(content)) {
      // If it's not a Buffer, try to convert it, assuming the input
      // content (if it's a string) should be treated as raw binary bytes.
      // NOTE: For robust code, you might want to enforce 'content' is a Buffer
      // or throw a clearer error if it's an unsupported type.
      try {
        dataToWrite = Buffer.from(content);
      } catch (e) {
        // Handle cases where Buffer.from() fails (e.g., content is an unsupported object)
        throw new Error(`Invalid content type for binary write: Cannot convert ${typeof content} to Buffer.`);
      }
    }
    // Leave encoding as null when writing a Buffer
  }

  try {
    // Use the imported fs/promises.writeFile
    // Pass the encoding in the options object (safe for both null/string values)
    await fs.writeFile(filename, dataToWrite, { encoding: encoding });
    // You might want to return something on success, e.g., true or the filename
    return true; 
  } catch (error) {
    console.error(`Error writing file ${filename}: ${error.message}`);
    // Re-throw the error to ensure the caller knows the operation failed
    throw error;
  }
}



// appendf -- append text to a file----------------
async function appendf(filename, content) {
  try {
    // fs.appendFile automatically creates the file if it doesn't exist
    // and defaults to 'utf8' encoding if none is specified, but we'll specify it
    // for clarity and best practice.
    await fs.appendFile(filename, content, { encoding: 'utf8' });

  } catch (error) {
    console.error(`Error appending to file ${filename}: ${error.message}`);
    // Re-throw the error for upstream error handling
    throw error;
  }
}




// readLastLineOf -- use this to get last line of a text file or csv file
async function readLastLineOf(filename) {
  let fileHandle;
  try {
    // 1. Get the file size and open a file handle
    const stats = await fs.stat(filename);
    const fileSize = stats.size;

    // Set a block size for reading (e.g., 1024 bytes = 1 KB)
    const BLOCK_SIZE = 1024;
    
    // Open the file for reading
    fileHandle = await fs.open(filename, 'r');

    let position = fileSize;
    let buffer = Buffer.alloc(BLOCK_SIZE);
    let bytesRead = 0;
    let totalContent = '';
    let lastLine = null;

    // 2. Loop backwards, reading blocks of data
    while (position > 0) {
      // Calculate start position for reading the block
      const readStart = Math.max(0, position - BLOCK_SIZE);
      const readSize = position - readStart;

      // Read the block
      ({ bytesRead } = await fileHandle.read(buffer, 0, readSize, readStart));
      
      // Convert the block to text and prepend it to the content string
      // Note: We only process the actual bytes read (readSize)
      totalContent = buffer.subarray(0, bytesRead).toString('utf8') + totalContent;
      
      // 3. Search for the newline character
      const newlineIndex = totalContent.lastIndexOf(EOL);

      if (newlineIndex > -1) {
        // Newline found: The text AFTER the last newline is the last line.
        lastLine = totalContent.substring(newlineIndex).trim();
        break; // Stop reading
      }

      // 4. Move position backward for the next read
      position = readStart;
      
      // If we've reached the beginning of the file and still haven't found a newline, 
      // the entire file is one line.
      if (position === 0) {
          lastLine = totalContent.trim();
      }
    }

    return lastLine || ''; // Return the line or an empty string if the file was empty.

  } catch (error) {
    console.error(`Error reading last line of ${filename}: ${error.message}`);
    throw error;
  } finally {
    // Crucial: Close the file handle
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}




/**
 * Retrieves the size of a file in bytes.
 * @param {string} filename The path to the file.
 * @returns {Promise<number>} The size of the file in bytes.
 * @throws {Error} Throws an error if the file does not exist or cannot be accessed.
 */
async function getSizef( filename ) {
  try {
    // 1. Get the Stats object
    const stats = await fs.stat(filename);
    
    // 2. The size is stored in the 'size' property (in bytes)
    const sizeInBytes = stats.size;
    
    return sizeInBytes;
  } catch (error) {
    console.error(`Error checking file size for ${filename}: ${error.message}`);
    throw error;
  }
}










// CSV STUFF /////////////////////////////////////////////////


// getCsvHead -------------------------------------------
// get csv header line from an objectt
function getCsvHead( obj ) {
  const keys = Object.keys(obj);
  const headerLine = keys.join(',');
  return headerLine + '\n';
}


// getCsvStr --------------------------------------
// convert obj into a csv-line and you can append to csv file

function getCsvLine( obj ) {
  const values = Object.values(obj);
  const csvLine = values.map(value => {
    let strValue = String(value);
    if (strValue.includes('"')) {
      strValue = strValue.replace(/"/g, '""');
    }
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
      return `"${strValue}"`;
    }

    return strValue;
  }).join(','); 
  return csvLine + '\n';
}









// getObjFromCsvStr ----------------------------------------
function getObjFromCsvStr(csvStr) {
  // 1. Split the CSV string into individual lines, removing any empty lines.
  const lines = csvStr.trim().split(/\r?\n/).filter(line => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  // 2. Parse the Header
  // The header line is parsed simply, as headers should not contain special chars.
  const headerLine = lines[0];
  const headers = headerLine.split(',');

  // 3. Process Data Lines
  const dataLines = lines.slice(1);
  const result = [];

  // Regex to split a line by comma, respecting double quotes
  // Explanation: Match either 1) text inside double quotes OR 2) characters that aren't commas
  const csvRegex = /(?:"((?:[^"]|"")*)"|([^,]*))/g;

  for (const line of dataLines) {
    const obj = {};
    let match;
    let fieldIndex = 0;

    // Iterate through matches found by the regex
    while ((match = csvRegex.exec(line)) !== null) {
      // Group 1 captures the quoted string (e.g., "value, with, comma")
      // Group 2 captures the unquoted string (e.g., simple value)
      let value = match[1] !== undefined ? match[1] : match[2];

      if (value !== undefined) {
        // Unescape internal double quotes (replace "" with ")
        value = value.replace(/""/g, '"');

        // Assign the value to the correct header key
        const key = headers[fieldIndex];
        if (key) {
          obj[key] = value.trim(); // Trim whitespace from values
        }
      }
      fieldIndex++;

      // Stop processing if we run out of headers
      if (fieldIndex >= headers.length) {
        break;
      }

      // Skip the comma separator in the input string
      if (line[csvRegex.lastIndex] === ',') {
        csvRegex.lastIndex++;
      }
    }

    // Only add the object if it has content
    if (Object.keys(obj).length > 0) {
      result.push(obj);
    }
  }

  return result;
}






// getCsvFromObj -------------------------------------------

function getCsvFromObj(input) {
  let data;

  // 1. Normalize Input: Check if the input is a single object and wrap it if necessary.
  if (Array.isArray(input)) {
    data = input;
  } else if (typeof input === 'object' && input !== null) {
    // Input is a single, non-null object, so we wrap it in an array.
    data = [input];
  } else {
    // Input is null, undefined, or a primitive (invalid).
    return "";
  }

  // Final check after normalization
  if (data.length === 0) {
    return "";
  }

  // 2. Generate the Header
  // Use the first object in the array to determine all key names (headers).
  const header = getCsvHead(data[0]);

  // 3. Process all Data Lines
  // Map over the array, converting each object into a CSV-formatted line.
  const lines = data.map(obj => getCsvLine(obj));

  // 4. Combine and Return
  // Prepend the header to the array of data lines and join them all.
  return header + lines.join('');
}





module.exports = { 
  readf, existf, writef, appendf, readLastLineOf, getSizef,
  getCsvHead, getCsvLine, getObjFromCsvStr, getCsvFromObj
}