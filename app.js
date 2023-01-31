const express = require("express");
const converter = require("json-2-csv");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const PORT = process.env.port || 4000;

const app = express();
const router = express.Router();
const baseUrl = "https://www.buzzbuzzhome.com";

app.use(express.json());
app.use(cors());

app.use(
  router.post("/scrape", async (req, res) => {
    try {
      const { cityName = "", stateName = "", fullScrape = false } = req.body;
      console.log(cityName, stateName, "state", fullScrape);
      let content = fs.readFileSync("./state_city_data.json");
      let objContent = JSON.parse(content);
      let csvName = "fulldata.csv";
      return res.status(200).send({ success: objContent, csvName });
      if (Boolean(cityName) && Boolean(stateName)) {
        const state = objContent.find((item) => item.stateName === stateName);
        objContent = [
          {
            ...state,
            cities: state.cities.filter((ele) => ele.cityName === cityName),
          },
        ];
        csvName = `${stateName}-${cityName}.csv`;
      } else if (!Boolean(cityName) && Boolean(stateName)) {
        objContent = objContent.filter((item) => item.stateName === stateName);
        csvName = `${stateName}.csv`;
      }
      const result = await scrapping({ list: objContent, csvName });
      console.log("scraping finished. please check *** full_data.csv *** file");
      return res.status(200).send({ success: result });
    } catch (err) {}
  })
);

app
  .use(express.static(path.resolve(__dirname, "build")))
  .get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "build", "index.html"));
  });

async function index() {
  try {
    let resState = await axios(baseUrl + "/place/on");
    let $state = cheerio.load(resState.data);

    let content = [];
    let htmlState = $state(".state-link", resState.data);
    console.log(htmlState.length);
    for (let i = 0; i < htmlState.length; i++) {
      let stateName = $state(htmlState[i]).text().trim();
      stateName = stateName.replace(/(\r\n|\n|\r)/gm, "");
      let stateLink = $state(htmlState[i]).attr("data-link");

      let cities = [];

      let resCity = await axios(baseUrl + "/place/" + stateLink);
      let $city = cheerio.load(resCity.data);

      let htmlCity = $city(".city-name", resCity.data);
      for (let j = 0; j < htmlCity.length; j++) {
        let cityName = $city(htmlCity[j]).find("a").text();
        let cityLink = $city(htmlCity[j]).find("a").attr("href");

        cities[j] = {
          cityName,
          cityLink,
        };
        console.log(j + 1, "/", htmlCity.length, "City", cityName);
      }
      content[i] = {
        stateName,
        stateLink,
        cities,
      };
      console.log(i + 1, "/", htmlState.length, "stateName", stateName);
    }
    var jsonContent = JSON.stringify(content, null, 2);
    fs.writeFileSync("state_city_data.json", jsonContent, "utf-8");
  } catch (error) {
    console.log(error);
  }
}

async function scrapping({ list = [], csvName }) {
  try {
    const objContent = list;
    let newStates = [];
    for await (const i of Array.from(Array(list.length).keys())) {
      // state
      let stateName = objContent[i].stateName;
      let stateLink = objContent[i].stateLink;
      let cities = objContent[i].cities;

      for (let j = 0; j < cities.length; j++) {
        //city
        let cityName = cities[j].cityName;
        let cityLink = cities[j].cityLink;

        let resNewHomes = await getAxiosData(baseUrl + cityLink);
        if (!Boolean(resNewHomes)) continue;

        let $newHomes = cheerio.load(resNewHomes.data);
        let htmlNewHomes = $newHomes("a", ".dev-list", resNewHomes.data);
        for (let k = 0; k < htmlNewHomes.length; k++) {
          //new construction
          let newHomeName = $newHomes(htmlNewHomes[k]).text();
          let newHomeLink = $newHomes(htmlNewHomes[k]).attr("href");

          let resUnits = await getAxiosData(baseUrl + newHomeLink);
          if (!Boolean(resUnits)) continue;
          let $units = cheerio.load(resUnits.data);

          let developerName = $newHomes(
            ".developer-name",
            ".development-misc-info",
            resUnits.data
          ).text();
          let developerLink = $newHomes(
            ".developer-name",
            ".development-misc-info",
            resUnits.data
          ).attr("href");

          let developerWebsite = null;
          let developerAddress = null;
          let developerPhone = null;

          if (developerLink) {
            let resDeveloper = await getAxiosData(baseUrl + developerLink);
            if (!Boolean(resDeveloper)) continue;

            let $developer = cheerio.load(resDeveloper.data);
            developerWebsite = $developer("a", ".address-wrapper").attr("href");
            let htmlDeveloperInfos = $developer("p", ".address-wrapper");

            developerAddress = $developer(htmlDeveloperInfos[0])
              .text()
              .trim()
              .replace("Address: ", "");
            developerPhone = $developer(htmlDeveloperInfos[1])
              .text()
              .trim()
              .replace("Telephone: ", "");
          }

          let htmlUnits = $units("script");

          let startPoint = -1;
          let endPoint = -1;

          for (let index = 37; index < 45; index++) {
            startPoint = $units(htmlUnits[index])
              .text()
              .indexOf("self.units = [{");
            endPoint = $units(htmlUnits[index]).text().indexOf("}];");
            txtData = $units(htmlUnits[index])
              .text()
              .substring(startPoint + 13, endPoint + 2)
              .trim();
            if (startPoint !== -1) {
              break;
            }
          }

          if (startPoint === -1 || endPoint === -1) {
            console.log(
              stateName,
              `(${i + 1}/${objContent.length})`,
              "-",
              cityName,
              `(${j + 1}/${cities.length})`,
              "-",
              newHomeName,
              `(${k + 1}/${htmlNewHomes.length})`,
              `(0)`
            );
            continue;
          }

          let objData = JSON.parse(txtData);

          objData = objData.filter((oneUnit) => {
            return oneUnit.statusName == "For Sale";
          });

          console.log(
            stateName,
            `(${i + 1}/${objContent.length})`,
            "-",
            cityName,
            `(${j + 1}/${cities.length})`,
            "-",
            newHomeName,
            `(${k + 1}/${htmlNewHomes.length})`,
            `(${objData.length})`
          );

          for (let p = 0; p < objData.length; p++) {
            //
            let unitName = objData[p].unitName;
            let unitStyle = objData[p].unitStyle;
            let br = objData[p].br;
            let ba = objData[p].ba;
            let sqft = objData[p].sqft;
            let price = objData[p].price || objData[p].lastPriceWithValue;
            let pps = Math.round(price / sqft);

            newStates = [
              ...newStates,
              {
                stateName,
                cityName,
                newHomeName,
                developerName,
                developerAddress,
                developerPhone,
                developerWebsite,
                unitName,
                unitStyle,
                br,
                ba,
                sqft,
                price,
                pps,
              },
            ];
          }
        }
        converter.json2csv(newStates, (err, csv) => {
          if (err) {
            console.log(err);
            throw err;
          }
          if (htmlNewHomes.length > 0) {
            fs.writeFileSync(`./csv/${csvName}`, csv);
            console.log(`successfully saved ${cityName} !!!`);
          }
        });
      }
    }
    return true;
  } catch (err) {
    console.log(err, "err");
  }
}

const getAxiosData = (url = "") => {
  return new Promise((resolve, reject) => {
    axios
      .get(url)
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        resolve("");
      });
  });
};

app.listen(PORT, () => {
  console.log(`server is running on PORT:${PORT}`);
});
