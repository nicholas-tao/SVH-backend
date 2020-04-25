require("dotenv").config();

const router = require("express").Router();
let Busyness = require("../models/busyness.model");
const express = require("express");
const app = express();
const axios = require("axios");
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

//this stuff to get from frontend
var longitude = 43.87896;
var latitude = -79.413383;

//longitude = 37.365892;
//latitude = -122.058422;
var radius = 5000; //in metres

var link1 =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=" +
  longitude +
  "," +
  latitude +
  "&radius=" +
  radius +
  "&type=grocery_or_supermarket&fields=name,formatted_address,user_ratings_total,place_id&key=" +
  API_KEY;

var link2 =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=" +
  longitude +
  "," +
  latitude +
  "&radius=" +
  radius +
  "&type=department_store&fields=name,formatted_address,user_ratings_total,place_id&key=" +
  API_KEY;

var names = [];
var address = [];
var busynessLevel = [];
var rating = [];
var storeSize = [];
var storeId = [];
var data = [];
var data2 = [];

router.get("/getstores", (request, response, next) => {
  axios
    .get(link1)
    .then((getResponse) => {
      console.log("GET Response");
      data = getResponse.data;

      for (var i = 0; i < data.results.length; i++) {
        names[i] = data.results[i].name;
        address[i] = data.results[i].vicinity;
        rating[i] = data.results[i].rating;
        storeSize[i] = data.results[i].user_ratings_total;
        storeId[i] = data.results[i].place_id;
      }
      return axios.get(link2);
    })
    .then((getResponse2) => {
      console.log("GET Response 2");
      data2 = getResponse2.data;

      var j = 0;

      for (
        var i = data.results.length - 1;
        i < data.results.length - 1 + data2.results.length;
        i++
      ) {
        if (
          data2.results[j].name.includes("Costco") ||
          data2.results[j].name.includes("Walmart")
        ) {
          names[i] = data2.results[j].name;
          address[i] = data2.results[j].vicinity;
          rating[i] = data2.results[j].rating;
          storeSize[i] = data2.results[j].user_ratings_total;
          storeId[i] = data2.results[j].place_id;
          j++;
        }
      }
      sortSizes();
      //next(); //express middleware use
      Busyness.find({}, function (err, store) {
        if (err) return handleError(err);
        console.log("this: " + store);
      });
    })
    .catch((err) => {
      console.log("Error:" + err.message);
    });
});

var busynessInDB = [];
var timesPreprocessed = [];
var scores = [];
var times = [];
/*
router.route("/getstores").get((req, response) => {
  for (var i = 0; i < names.length; i++) {
    const query = Busyness.find({ storeAddress: address[i] })
    console.log(query[0])
      .then((data) => {
        console.log(response);
        var dataReturned = response.json(); //THE BUG IS RIGHT HERE (how do i store the response form mongo???) --> look at this: https://docs.mongodb.com/guides/server/read_queries/
        //console.log(dataReturned);
        for (var j = 0; j < dataReturned.length; j++) {
          busynessInDB[j] = dataReturned[j].busyness;
          timesPreprocessed = dataReturned[j].createdAt;
        }

        busynessLevel[i] = determineBusyness();
      })
      .catch((err) => {
        console.log("Error:" + err.message);
      });
  }
  populateDataToSend();
  response.send(busynessDataToSend);
});
*/
// sort stores by size
function sortSizes() {
  var swapp;
  var n = storeSize.length - 1;
  do {
    swapp = false;
    for (var i = 0; i < n; i++) {
      if (storeSize[i] < storeSize[i + 1]) {
        var temp = storeSize[i];
        storeSize[i] = storeSize[i + 1];
        storeSize[i + 1] = temp;

        var temp2 = names[i];
        names[i] = names[i + 1];
        names[i + 1] = temp2;

        var temp3 = rating[i];
        rating[i] = rating[i + 1];
        rating[i + 1] = temp3;

        var temp4 = address[i];
        address[i] = address[i + 1];
        address[i + 1] = temp4;

        swapp = true;
      }
    }
    n--;
  } while (swapp);
}

//if no data about store, returns "not busy"
function determineBusyness() {
  convert(); // convert busyness into scores
  convertTime();
  var x = 0;
  var y = 0;
  for (var i = 0; i < scores.length; i++) {
    if (times.length == 0) {
      return "Insufficient Data";
    }
    // getting weighted average
    var z = 1 / Math.pow(times[i] + 1, 2);
    x += scores[i] * z;
    y += z;
  }
  var weightedScore = Math.round(x / y);
  var final = chooseClosest(weightedScore); // choosing final busyness score

  str = outcome(final); // final busyness as a string
  return str;
}

function convert() {
  for (var i = 0; i < busynessInDB.length; i++) {
    if (busynessInDB[i] == "not busy") {
      scores[i] = 100;
    } else if (busynessInDB[i] == "somewhat busy") {
      scores[i] = 150;
    } else if (busynessInDB[i] == "moderately busy") {
      scores[i] = 200;
    } else if (busynessInDB[i] == "busy") {
      scores[i] = 250;
    } else if (busynessInDB[i] == "very busy") {
      scores[i] = 300;
    } else if (busynessInDB[i] == "extremely busy") {
      scores[i] = 350;
    }
  }
}

function chooseClosest(finalScore) {
  // rounds raw score to the closest busyness score
  var busynessScore = [100, 150, 200, 250, 300, 350];

  var closest = busynessScore.reduce(function (prev, curr) {
    return Math.abs(curr - finalScore) < Math.abs(prev - finalScore)
      ? curr
      : prev;
  });
  return closest;
}

function outcome(m) {
  if (m == 100) {
    return "Not Busy";
  } else if (m == 150) {
    return "Somewhat Busy";
  } else if (m == 200) {
    return "Moderately Busy";
  } else if (m == 250) {
    return "Busy";
  } else if (m == 300) {
    return "Very Busy";
  } else if (m == 250) {
    return "Extremely Busy";
  } else {
    return "Insufficient Data";
  }
}

function getDateTime() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  var hour = now.getHours();
  var minute = now.getMinutes();
  if (month.toString().length == 1) {
    month = "0" + month;
  }
  if (day.toString().length == 1) {
    day = "0" + day;
  }
  if (hour.toString().length == 1) {
    hour = "0" + hour;
  }
  if (minute.toString().length == 1) {
    minute = "0" + minute;
  }

  var dateTime = year + "/" + month + "/" + day + "/" + hour + ":" + minute;
  return dateTime;
}

function convertTime() {
  for (var i = 0; i < timesPreprocessed.length; i++) {
    times[i] = elapsedTime(timesPreprocessed[i]);
  }
}
function elapsedTime(startTimeProcessed) {
  var endTimeProcessed = getDateTime();
  var year1 = parseInt(startTimeProcessed.substring(0, 4));
  var month1 = parseInt(startTimeProcessed.substring(5, 7));
  var day1 = parseInt(startTimeProcessed.substring(8, 10));
  var hour1 = parseInt(startTimeProcessed.substring(11, 13));
  var minute1 = parseInt(startTimeProcessed.substring(14, 16));

  var year2 = parseInt(endTimeProcessed.substring(0, 4));
  var month2 = parseInt(endTimeProcessed.substring(5, 7));
  var day2 = parseInt(endTimeProcessed.substring(8, 10));
  var hour2 = parseInt(endTimeProcessed.substring(11, 13));
  var minute2 = parseInt(endTimeProcessed.substring(14, 16));

  var elapse = Math.abs(
    year1 * 365 * 24 * 60 +
      month1 * 30 * 24 * 60 +
      day1 * 24 * 60 +
      hour1 * 60 +
      minute1 -
      (year2 * 365 * 24 * 60 +
        month2 * 30 * 24 * 60 +
        day2 * 24 * 60 +
        hour2 * 60 +
        minute2)
  );
  return elapse;
}

var busynessDataToSend = [];

function populateDataToSend() {
  for (var i = 0; i < names.length; i++) {
    busynessDataToSend.push({
      name: names[i],
      address: address[i],
      busyness: busynessLevel[i],
    });
  }
}

router.route("/add").post((req, res) => {
  const storeAddress = req.body.storeAddress;
  const busyness = req.body.busyness;

  const newBusyness = new Busyness({
    storeAddress,
    busyness,
  });

  newBusyness
    .save()
    .then(() => res.json("Busyness added!"))
    .catch((err) => res.status(400).json("Error: " + err));
});

//for when user wants to view busyness (First they send their coordinates and radius)
router.route("/view").post((req, res) => {
  const latitude = req.body.latitude;
  const longitude = req.body.longitude;
  const radius = req.body.radius;

  //console.log(latitude + "," + longitude);
  //console.log(radius);
});

module.exports = router;
