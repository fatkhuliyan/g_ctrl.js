const exec = require('child_process').exec;
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

module.exports = {listFiles, listFoldersById, listFilesById, lastFoldersById};

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles() {
  const drive = google.drive({version: 'v3', auth: await authorize()});
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    // q: `mimeType = 'application/vnd.google-apps.folder' and sharedWithMe and trashed=false`,
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }
  console.log('Files:');
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}
async function listFoldersById() {
    const drive = google.drive({version: 'v3', auth: await authorize()});
    const res = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and '{FOLDER_ID}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 10,
      orderBy: 'createdTime desc',
    });
    let data_res = [];
    const files = res.data.files;
    if (files.length === 0) {
      console.log('No files found.');
      return {'err':'no data'};
    }
    files.map((file) => {
      data_res.push({'name':file.name, 'id':file.id});
    });
    return data_res;
}

async function lastFoldersById() {
  const drive = google.drive({version: 'v3', auth: await authorize()});
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and '{FOLDER_ID}' in parents and trashed=false`,
    fields: 'nextPageToken, files(id, name)',
    pageSize: 1,
    orderBy: 'createdTime desc',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return {'err':'no data'};
  }
  // console.log('Files:');
  console.log(files[0]);
  return {'err':null,'name':files[0]['name'], 'id':files[0]['id']}
  // files.map((file) => {
  //   console.log(`${file.name} (${file.id})`);
  //   return {'err':null,'name':file.name, 'id':file.id}
  // });
}

async function listFilesById(vid) {
  let last_data = await listFoldersById();
  let data_test = new RegExp(vid, "g");
  if(last_data.err){
    return 'Error : '+last_data.err;
  }else{
    let data_id = last_data.find(x => data_test.test(x.name));
    if(data_id){
      data_id = data_id?data_id.id:'data not found';
      const drive = google.drive({version: 'v3', auth: await authorize()});
      const res = await drive.files.list({
        q: `mimeType != 'application/vnd.google-apps.folder' and '${data_id}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, driveId)',
        orderBy: 'name desc',
      });
      const files = res.data.files;
      if (files.length === 0) {
        console.log('No files found.');
        return ({'status':'error','state':'No files found.'});
      }
      let map_err = [];
      // files.map((file) => {
      for (const file of files){
        let _vid = (file.name.split("-"))[1]
        let headers = 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';
        myExec(`curl -H "${headers}" --data "id=${_vid}&uri=https://drive.google.com/file/d/${file.id}/view?usp=drivesdk&host=drive" "{URL_API}"`)
        .then((_res)=>{console.log(_res)})
        .catch((err) => {
          console.log(err)
          map_err.push(`id=${_vid}&uri=https://drive.google.com/file/d/${file.id}/view?usp=drivesdk&host=drive`);
        });
        console.log(`${file.name} (${file.id})`);
      };
      if(map_err.length>0){
        console.log(map_err);
        return ({'status':'error','len':map_err.length,'state':'some uri not syncronized'});
      }else{
        return ({'status':'success','len':files.length,'state':'ready to syncronised'});
      }
    }else{
      return ({'status':'error','state':'Id Not Match'});
    }
  }
}

function myExec(cmd) {
  return new Promise((resolve,reject) => {
    exec(cmd,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) reject(parseError(err));
      resolve(res);
    })
  })
}

function parseError(err) {
  try {
    err = err.message.trim().split('\n');
    return {message: err[err.length -1]};
  } catch (e) {
    return err;
  }
}
