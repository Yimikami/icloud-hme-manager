import { v4 as uuidv4 } from "uuid";

const CLIENT_BUILD_NUMBER = "2604Build17";
const CLIENT_MASTERING_NUMBER = "2604Build17";
const LANG_CODE = "en-en";

let clientId = uuidv4();

export function getQueryParams(dsid) {
  return new URLSearchParams({
    clientBuildNumber: CLIENT_BUILD_NUMBER,
    clientMasteringNumber: CLIENT_MASTERING_NUMBER,
    clientId,
    dsid,
  }).toString();
}

export function getHeaders(cookies) {
  return {
    accept: "*/*",
    "content-type": "text/plain",
    origin: "https://www.icloud.com",
    referer: "https://www.icloud.com/",
    cookie: cookies,
  };
}

export { LANG_CODE };
