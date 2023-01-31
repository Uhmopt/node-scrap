const express = require('express');
const converter = require('json-2-csv')
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const app = express();

const PORT = process.env.port || 4000;

const baseUrl = 'https://www.buzzbuzzhome.com'
let states = [];

async function index() {

    try {
        let resState = await axios(baseUrl + '/place/on')
        let $state = cheerio.load(resState.data);

        let content = [];
        let htmlState = $state('.state-link', resState.data)
        console.log(htmlState.length)
        for (let i = 0; i < htmlState.length; i++) {
            let stateName = $state(htmlState[i]).text().trim();
            stateName = stateName.replace(/(\r\n|\n|\r)/gm, "");
            let stateLink = $state(htmlState[i]).attr('data-link');

            let cities = [];

            let resCity = await axios(baseUrl + '/place/' + stateLink)
            let $city = cheerio.load(resCity.data);

            let htmlCity = $city('.city-name', resCity.data);
            for (let j = 0; j < htmlCity.length; j++) {
                let cityName = $city(htmlCity[j]).find('a').text();
                let cityLink = $city(htmlCity[j]).find('a').attr('href');

                cities[j] = {
                    cityName,
                    cityLink
                };
                console.log(j + 1, '/', htmlCity.length, "City", cityName)
            }
            content[i] = {
                stateName,
                stateLink,
                cities
            };
            console.log(i + 1, '/', htmlState.length, "stateName", stateName)
        }
        var jsonContent = JSON.stringify(content, null, 2);
        fs.writeFileSync('state_city_data.json', jsonContent, 'utf-8');
    } catch (error) {
        console.log(error);
    }
}

async function getNewHomes() {
    let content = fs.readFileSync('./toronto.json');
    let objContent = JSON.parse(content);

    let newStates = []

    for (let i = 0; i < objContent.length; i++) {   // state
        let stateName = objContent[i].stateName;
        let stateLink = objContent[i].stateLink
        let cities = objContent[i].cities;

        let newCities = []
        for (let j = 0; j < cities.length; j++) {   //city
            let cityName = cities[j].cityName;
            let cityLink = cities[j].cityLink;
            let newHomes = [];

            let resNewHomes = await axios(baseUrl + cityLink)
            let $newHomes = cheerio.load(resNewHomes.data)
            let htmlNewHomes = $newHomes('a', '.dev-list', resNewHomes.data)
            for (let k = 0; k < htmlNewHomes.length; k++) {     //new construction
                let newHomeName = $newHomes(htmlNewHomes[k]).text()
                let newHomeLink = $newHomes(htmlNewHomes[k]).attr('href')

                let resUnits = await axios(baseUrl + newHomeLink)
                let $units = cheerio.load(resUnits.data)

                let developerName = $newHomes('.developer-name', '.development-misc-info', resUnits.data).text()

                let htmlUnits = $units('script')

                let startPoint = -1;
                let endPoint = -1;

                for (let index = 37; index < 45; index++) {
                    startPoint = $units(htmlUnits[index]).text().indexOf('self.units = [{')
                    endPoint = $units(htmlUnits[index]).text().indexOf('}];')
                    txtData = $units(htmlUnits[index]).text().substring(startPoint + 13, endPoint + 2).trim()
                    if (startPoint !== -1) {
                        break
                    }
                }

                if (startPoint === -1 || endPoint === -1) {
                    console.log(stateName, `(${i + 1}/${objContent.length})`, '-', cityName, `(${j + 1}/${cities.length})`, '-', newHomeName, `(${k + 1}/${htmlNewHomes.length})`, `(0)`);
                    continue
                }

                let objData = JSON.parse(txtData);

                objData = objData.filter((oneUnit) => {
                    return oneUnit.statusName == 'For Sale'
                })

                let units = [];

                console.log(stateName, `(${i + 1}/${objContent.length})`, '-', cityName, `(${j + 1}/${cities.length})`, '-', newHomeName, `(${k + 1}/${htmlNewHomes.length})`, `(${objData.length})`);

                for (let p = 0; p < objData.length; p++) {    //
                    let unitName = objData[p].unitName
                    let unitStyle = objData[p].unitStyle
                    let br = objData[p].br
                    let ba = objData[p].ba
                    let sqft = objData[p].sqft
                    let price = objData[p].price || objData[p].lastPriceWithValue
                    let pps = Math.round(price / sqft)

                    newStates = [...newStates, {
                        stateName,
                        cityName,
                        newHomeName,
                        developerName,
                        unitName,
                        unitStyle,
                        br,
                        ba,
                        sqft,
                        price,
                        pps
                    }]
                }
            }
        }
    }

    converter.json2csv(newStates, (err, csv) => {
        if (err) {
            console.log(err);
            throw err
        }
        fs.writeFileSync('./toronto.csv', csv)
        console.log('successfully saved!!!');
    })

}

app.listen(PORT, () => {
    console.log(`server is running on PORT:${PORT}`);
    // index()
    getNewHomes();
})
