import Redis from "ioredis";
import zlib from "zlib";
import log4js from "log4js";

// Configure the logger
log4js.configure({
  appenders: { console: { type: "console" } },
  categories: { default: { appenders: ["console"], level: "trace" } },
});
// Get the logger instance
const logger = log4js.getLogger();

const REDIS_HOST = "redis-15596.c270.us-east-1-3.ec2.cloud.redislabs.com";
const REDIS_PORT = "15596";
const REDIS_PASW = "yQG3PbrwvFk0VCHX4RHCpGXbuMS8J71n";
const cacheClient = new Redis({
  port: REDIS_PORT,
  host: REDIS_HOST,
  connectTimeout: 10000,
  username: "default",
  password: REDIS_PASW,
});

export async function setDataInCache(key, value) {
  logger.info(`Storing data in redis...`);
  return await cacheClient.lpush(key, value);
}
export async function getDataFromCache(key) {
  logger.info(`Getting data from redis...`);
  return await cacheClient.get(key);
}
export async function deleteDataFromCache(key) {
  logger.info(`Deleting data from redis...`);
  return await cacheClient.del(key);
}
export default cacheClient;


export const handler = async (event) => {
  // TODO implement
  getIVRLogs(event);

};

//Get Cloud watch logs for oblab2
function getIVRLogs(event) {
  //let information
  logger.info(`Getting IVR logs from cloud watch...`);
  try {
    let data = JSON.stringify(event);
    data = JSON.parse(data);
    logger.debug(`Cloud watch event: ${data}`);
    //console.log("Details: ", data);
    //Getting body data from event
    let bodyData;
    bodyData = data.awslogs.data;
    logger.debug(`Data in body of the event: ${bodyData}`);
    //console.log("Body data: ", bodyData);

    // Decode Base64 data
    logger.info(`Going to decode the data...`);
    let decodedData = Buffer.from(bodyData, 'base64');
    //console.log("Decode data: ", decodedData);
    // Decompress the Gzip data
    zlib.gunzip(decodedData, (error, decompressedData) => {
      if (error) {
        //console.error('Error:', error);
        logger.error("Error while decompressing the gzip compressed buffer: ", error);
      }
      else {
        // Interpret the decompressed data as text
        let textData = decompressedData.toString('utf-8');
        textData = (JSON.parse(textData));
        //console.log("Messages Data: ", textData);
        logger.debug(`Message data of logs: ${textData}`);

        let information = textData.logEvents.map(event => {  //Array method
          logger.info(`Going to get data required to create IVR tree...`);
          const messageData = JSON.parse(event.message);
          let requiredData;
          if (messageData.ContactFlowModuleType === "GetUserInput") {
            requiredData = {
              // flow_name: messageData.ContactFlowName,
              module: messageData.ContactFlowModuleType,
              identifier: messageData.Identifier,
              contact_Id: messageData.ContactId,
              Module_Result: messageData.Results
            };
            requiredData = JSON.stringify(requiredData);
           // logger.debug(`Information required to create IVR tree: ${requiredData}`);
            return requiredData;
          }
          else {
            logger.warn(`Unexpected module type!`);
            return null;
          }

        });

        //console.log("Information is: ", information);
         logger.debug(`Information required to create IVR tree: ${information}`);
        //Store this information in redis
        //const firstInfoWithContactId = information.find(info => info && info.contact_Id);

        const mainModule = information.find(info => info);
        // console.log("Module type: ", mainModule);
        // console.log("Single module: ", mainModule.module);
        // logger.info(`Module type: ${mainModule}`); //no need to print
        // let singleModule = mainModule.module;
        // logger.info(`Single module: ${singleModule}`); //no need to print
        if (information) {
          logger.info(`Going to find contact id to store information in redis...`);
          // const firstInfoWithContactId = information.find(info => info.contact_Id);
          const firstInfoWithContactId = information.contact_Id;
          information = JSON.stringify(information);
          let id;
          if (firstInfoWithContactId) {
            id = firstInfoWithContactId.contact_Id;
            // console.log("Contact Id:", id);
            logger.info(`Contact id: ${id}`);
            const redisData = setDataInCache(id, information);
            // console.log("Information is successfully stored in redis.", information);
            if (redisData) {
              logger.debug(`Information is successfully stored in redis: ${information}`);
            } else {
              logger.error(`Error while storing data in redis.`);
            }

          }
          else {
            // console.log("No 'contact_Id' found in the 'information' array.");
            logger.error(`No contact_Id found in the 'information' array.`);
          }

        }
        else{
          logger.info(`Nothing to store in redis.`);
        }

      }
    });
  }
  catch (error) {
    // console.log("Unable to find logs.");
    // console.log("Error is: ", error);
    logger.error("Error while finding IVR logs from cloud watch: ", error);
  }

}
