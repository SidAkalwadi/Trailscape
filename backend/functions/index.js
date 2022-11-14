const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {Buffer} = require("buffer");

admin.initializeApp({
  storageBucket: "trailscape-send.appspot.com",
});

const cors = require("cors")({origin: true});

// Takes in a document id and returns the document with saved data
exports.getData = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    const postId = request.query.postId;
    const collection = admin.firestore().collection("imageLists");

    collection.doc(postId).get().then((docRef) =>{
      response.send(docRef.data());
    });
  });
});

// Takes in a file name and returns a signed url for it
exports.getImage = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    const fileName = request.query.filename;
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileName);
    file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 1000 * 60 * 10, // 10 minutes
    }).then((signedUrls) => {
      functions.logger.info(signedUrls[0]);
      response.send(signedUrls[0]);
    });
  });
});

// Saves a list of image filenames and captions to a document, returns the unique key created to be used as a folder name
exports.saveData = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    const filenames = request.body.filenames;
    const captions = request.body.captions;
    const coordinates = request.body.coordinates;
    const titles = request.body.titles;
    const timestamps = request.body.timestamps;

    const collection = admin.firestore().collection("imageLists");
    const docData = {
      filenames: filenames,
      captions: captions,
      coordinates: coordinates,
      titles: titles,
      times: timestamps,
    };

    collection.add(docData).then((docRef) => {
      response.send(docRef.path);
    });
  });
});


// takes in a file and filename and uploads to google cloud storage bucket under the unique folder
exports.uploadFile = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    const filedata = request.body.filedata;
    const filename = request.body.filename;

    const base64EncodedImageString = filedata.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64EncodedImageString, "base64");

    const bucket = admin.storage().bucket();
    bucket.file(filename).save(imageBuffer);

    response.send(200);
  });
});

