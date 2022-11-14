<template>
  <div id="app">
    <div id="unfocus"></div>
    <img id="display"/>
    <div id="map"></div>
    <div id="captions" v-on:scroll="getScrollView">
      <div v-for="marker in markers"
          :key="marker.imgTitle + marker.imgCaption + marker.imgFilename + marker.time.toString()"
          id = "container">
          <div class="box" v-on:mouseenter="highlightPin(markers.indexOf(marker))">
            <span v-if="editmode===true" class="title" role="textbox" contenteditable>{{marker.imgTitle}}</span>
            <span v-if="editmode===true" class="caption" role="textbox" contenteditable>{{marker.imgCaption}}</span>
            <p v-if="editmode===false" class="titleText">{{marker.imgTitle}}</p>
            <p v-if="editmode===false" class="captionText">{{marker.imgCaption}}</p>
            <input :disabled="editmode===false" type="datetime-local" step="1" class="datePicker" :value="formatDateTime(marker.time)" v-on:change="(event) => {marker.time=new Date(event.target.value); sortMarkers(true)}"/>
            <button class="viewButton" v-on:click="viewImage(markers.indexOf(marker))">View Image</button>
          </div>
          <div class = "dashed"></div>
      </div>
    </div>
    <button v-if="editmode===true" id="addButton" v-on:click="addFile">Add images</button>
    <button v-if="editmode===true" id="saveButton" v-on:click="sendFileData">Save</button>
    <input v-if="editmode===true" id='fileInput' type="file" multiple="multiple">
  </div>
</template>

<script>
import { Loader } from '@googlemaps/js-api-loader'
import { getData, getTag } from 'exif-js'

const loader = new Loader({
  apiKey: process.env.VUE_APP_GOOGLE_API_KEY,
  version: 'weekly',
  libraries: ['places']
})

const mapOptions = {
  zoom: 17.5,
  mapId: 'a4da5db6080b57fa',
  disableDefaultUI: true,
  mapTypeId: 'satellite',
  tilt: 45
}

let map
let google
let totalSize = 0
let directionsService
let directionsRenderer
const pinSVGHole =
  'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z'

let markerImage
let currentPin = 0
const baseUrl = 'https://us-central1-trailscape-send.cloudfunctions.net'

export default {
  name: 'App',
  mounted () {
    document.title = 'Trailscape'
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.has('postId')) {
      this.editmode = false
      console.log('loading data from post with id ' + urlParams.get('postId'))
      this.loadExisting(urlParams.get('postId'))
    }

    if (this.editmode) {
      document.getElementById('fileInput').addEventListener('change', this.handleFileSelect, false)
    }

    document.getElementById('unfocus').addEventListener('click', function () {
      document.getElementById('unfocus').style.display = 'none'
      document.getElementById('display').style.display = 'none'
    }, false)

    // Promise
    loader
      .load()
      .then((googleObj) => {
        google = googleObj
        map = new google.maps.Map(document.getElementById('map'), mapOptions)
        map.setCenter(new google.maps.LatLng(
          38.9907699,
          -77.5389951
        ))

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(function (location) {
            map.setCenter(new google.maps.LatLng(
              location.coords.latitude,
              location.coords.longitude
            ))
          })
        }

        markerImage = {
          path: pinSVGHole,
          anchor: new google.maps.Point(12, 23),
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#a62d29',
          scale: 1.75,
          fillColor: '#db3e39'
        }

        // create directions and directions renderer objects
        directionsService = new google.maps.DirectionsService()
        directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#0080db',
            strokeOpacity: 1.0,
            strokeWeight: 8
          }
        })
      })
      .catch(e => {
        // do something
      })
  },
  methods: {
    addFile () {
      document.getElementById('fileInput').click()
      document.getElementById('addButton').style.display = 'none'
    },
    finishLoading () {
      this.sortMarkers(false)
      this.renderPath()
    },
    loadExisting (postId) {
      const markers = this.markers
      const finishLoading = this.finishLoading
      fetch(baseUrl + '/getData?postId=' + postId)
        .then(function (response) {
          return response.json()
        }).then(function (data) {
          const _markers = markers // reference for later
          const _finishLoading = finishLoading
          const captions = data.captions
          const filenames = data.filenames
          const titles = data.titles
          const times = data.times
          const coordinates = data.coordinates
          let loaded = 0
          for (let index = 0; index < filenames.length; index++) {
            fetch(baseUrl + '/getImage?filename=' + postId + '/' + filenames[index])
              .then(function (response) {
                return response.text()
              }).then(function (data) {
                const marker = new google.maps.Marker({
                  position: { lat: coordinates[index].lat, lng: coordinates[index].lng },
                  map,
                  draggable: false,
                  title: 'Waypoint Pin',
                  icon: markerImage
                })

                _markers.push({
                  marker,
                  time: new Date(times[index]),
                  imgSrc: data,
                  imgFilename: '', // not needed in view mode
                  imgTitle: titles[index],
                  imgCaption: captions[index]
                })
                loaded++
                if (loaded === filenames.length) {
                  _finishLoading()
                }
              })
          }
        })
    },
    getHandleFileLoad (filename) {
      const renderPath = this.renderPath // references for later
      const sortMarkers = this.sortMarkers
      const markers = this.markers

      return function (event) {
        const img = document.createElement('img')
        img.style.display = 'none'

        img.onload = function () {
          getData(img, function () {
            const lon = getTag(img, 'GPSLongitude')
            const lonRef = getTag(img, 'GPSLongitudeRef')
            const lat = getTag(img, 'GPSLatitude')
            const latRef = getTag(img, 'GPSLatitudeRef')
            let time = getTag(img, 'DateTimeOriginal')

            let longitude = map.getCenter().lng()
            let latitude = map.getCenter().lat()

            try {
              longitude = parseFloat(lon[0]) + parseFloat(lon[1]) / 60 + parseFloat(lon[2]) / (60 * 60)
              if (lonRef === 'W') { longitude = longitude * -1 }

              latitude = parseFloat(lat[0]) + parseFloat(lat[1]) / 60 + parseFloat(lat[2]) / (60 * 60)
              if (latRef === 'S') { latitude = latitude * -1 }
            } catch {
              console.log('error with coords, using ' + latitude + ', ' + longitude)
              time = '0000:00:00 00:00:00' // default if file cannot be read
            }

            const marker = new google.maps.Marker({
              position: { lat: latitude, lng: longitude },
              map,
              draggable: true,
              title: 'Waypoint Pin',
              icon: markerImage
            })

            marker.addListener('dragend', () => {
              renderPath()
            })

            const _time = time.split(/\D/)
            markers.push({
              marker,
              time: new Date(_time[0], _time[1] - 1, _time[2], _time[3], _time[4], _time[5]),
              imgSrc: event.target.result,
              imgFilename: filename,
              imgTitle: '',
              imgCaption: ''
            })

            // Only sort the array of markers by time once they have loaded
            // Sorting is to have the correct order for waypoints in the directions api
            if (markers.length === totalSize) {
              sortMarkers(false) // don't try to save data since vue hasn't rendered everything yet
            }
            img.remove()
          })
        }
        img.src = event.target.result
      }
    },
    handleFileSelect (event) {
      totalSize = event.target.files.length
      for (let index = 0; index < event.target.files.length; index++) {
        const reader = new FileReader()
        reader.onload = this.getHandleFileLoad(event.target.files[index].name)
        reader.readAsDataURL(event.target.files[index])
      }
    },
    updateTitlesAndCaptions () {
      const titles = document.getElementsByClassName('title')
      const captions = document.getElementsByClassName('caption')

      for (let index = 0; index < totalSize; index++) {
        this.markers[index].imgTitle = titles[index].innerText
        this.markers[index].imgCaption = captions[index].innerText
      }
    },
    sortMarkers (save) {
      // first save all input data to the markers array before sorting
      if (save) {
        this.updateTitlesAndCaptions()
      }
      this.markers.sort(function (a, b) {
        return a.time - b.time
      })
      console.log(this.markers)
      this.renderPath()
      this.highlightPin(0) // start with pin 0 highlighted
    },
    renderPath () {
      if (this.markers.length < 2) {
        return // don't render a path if there aren't at least two markers
      }
      const waypts = []
      const start = new google.maps.LatLng(
        this.markers[0].marker.position.lat(),
        this.markers[0].marker.position.lng()
      )
      const end = new google.maps.LatLng(
        this.markers[this.markers.length - 1].marker.position.lat(),
        this.markers[this.markers.length - 1].marker.position.lng()
      )

      for (let index = 1; index < this.markers.length - 1; index++) {
        const pt = {
          location: {
            lat: this.markers[index].marker.position.lat(),
            lng: this.markers[index].marker.position.lng()
          }
        }
        waypts.push(pt)
      }

      const request = {
        origin: start,
        destination: end,
        waypoints: waypts,
        travelMode: google.maps.TravelMode.WALKING
      }
      directionsService.route(request, function (result, status) {
        if (status === 'OK') {
          directionsRenderer.setMap(map)
          directionsRenderer.setDirections(result)
        } else {
          directionsRenderer.setMap(undefined)
          directionsRenderer.setDirections(undefined)
        }
      })
    },
    async sendFileData () {
      console.log('sending file data')
      this.editmode = false
      this.updateTitlesAndCaptions()
      const body = {
        captions: [],
        coordinates: [],
        filenames: [],
        titles: [],
        timestamps: []
      }

      for (let index = 0; index < this.markers.length; index++) {
        const markerData = this.markers[index]
        body.titles.push(markerData.imgTitle)
        body.captions.push(markerData.imgCaption)
        body.filenames.push(markerData.imgFilename)
        body.coordinates.push({
          lat: markerData.marker.position.lat(),
          lng: markerData.marker.position.lng()
        })
        body.timestamps.push(markerData.time.toString())
      }
      console.log(body)
      let folder = ''
      await fetch(baseUrl + '/saveData', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
        .then(function (response) {
          console.log(response.status)
          return response.text()
        }).then(function (data) {
          folder = data.split('/')[1] // string needed here for folder uploads, ignore collection name here
          console.log(folder)
        })

      let count = 0
      for (let index = 0; index < this.markers.length; index++) {
        const markerData = this.markers[index]
        const filename = folder + '/' + markerData.imgFilename
        const filedata = markerData.imgSrc

        await fetch(baseUrl + '/uploadFile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filedata, filename })
        })
          .then(res => res.text())
          .then(data => {
            if (data === 'OK') {
              count++
            }
          })
      }
      if (count === this.markers.length) {
        alert('Successfully posted! You can now share using the following link:   https://trailscape-send.web.app/?postId=' + folder)
      }
    },
    viewImage (index) {
      document.getElementById('unfocus').style.display = 'block'
      const display = document.getElementById('display')
      display.style.display = 'inline'
      display.src = this.markers[index].imgSrc

      display.onload = function () { // center image in the viewing area
        const width = display.offsetWidth
        const height = display.offsetHeight

        display.style.top = 'calc(50vh - ' + height / 2 + 'px)'
        display.style.left = 'calc(50vw - 230px - ' + width / 2 + 'px)'
      }
    },
    highlightPin (i) {
      currentPin = i
      const highlightImage = JSON.parse(JSON.stringify(markerImage))
      highlightImage.fillColor = '#68f53d'
      highlightImage.strokeColor = '#48ad2a'
      for (let index = 0; index < this.markers.length; index++) {
        if (i === index) {
          this.markers[index].marker.setIcon(highlightImage)
          this.markers[index].marker.setAnimation(google.maps.Animation.BOUNCE)
          const latLng = this.markers[index].marker.getPosition() // returns LatLng object
          map.panTo(latLng)
        } else {
          this.markers[index].marker.setIcon(markerImage)
          this.markers[index].marker.setAnimation(null)
        }
      }
    },
    getScrollView () {
      const elements = document.getElementsByClassName('box')
      for (let index = 0; index < elements.length; index++) {
        if (elements[index].getBoundingClientRect().bottom > 80) {
          if (index !== currentPin) {
            this.highlightPin(index)
          }
          break
        }
      }
    },
    formatDateTime (date) {
      const year = date.getFullYear().toLocaleString('en-US', { minimumIntegerDigits: 4, useGrouping: false })
      const month = (date.getMonth() + 1).toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
      const day = date.getDate().toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
      const hour = date.getHours().toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
      const min = date.getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
      const sec = date.getSeconds().toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })

      return year + '-' + month + '-' + day + 'T' + hour + ':' + min + ':' + sec
    }
  },
  data () {
    return {
      markers: [],
      editmode: true
    }
  }
}
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@300&display=swap');
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  height: 100vh;
  width: 100vw;
  padding: 0px;
}

body{
  margin: 0px;
}

#map {
  position: absolute;
  left: 0px;
  top:0px;
  height: 100%;
  width: 100%;
  padding: 0px;
  z-index: 0;
  border: none;
}

#captions {
  position: absolute;
  right: 0px;
  top: 0px;
  height: 100%;
  width: 400px;
  background-color: rgba(14, 14, 14, 0.836);
  box-shadow: 0 0 30px 50px rgba(14, 14, 14, 0.836);
  padding: 0px;
  z-index: 1;
  overflow-y: scroll;
  overflow-x: clip;
}

#addButton{
  position: absolute;
  border: 1px solid rgb(235, 235, 235);
  border-radius: 5px;
  right:50px;
  top:45vh;
  width: 300px;
  height: 70px;
  z-index: 100;
  background-color: rgb(37, 37, 37);
  color: rgb(235, 235, 235);
  font-family: 'Barlow', sans-serif;
  font-weight: 300;
  font-size: 30px;
}

#saveButton{
  position: absolute;
  border: 2px solid black;
  border-radius: 5px;
  left:50px;
  top:50px;
  width: 90px;
  height: 40px;
  background-color: white;
  color: black;
  font-family: 'Barlow', sans-serif;
  font-weight: 300;
  font-size: 25px;
}

#addButton:hover{
  background-color: rgb(80, 80, 80);
  cursor:pointer;
}

#saveButton:hover{
  background-color: rgb(238, 238, 238);
  cursor:pointer;
}

#fileInput{
 display: none;
}

.box{
  width: stretch;
  height: auto;
  border: 1px solid white;
  border-radius: 30px;
  margin-left: 20px;
  margin-right: 20px;
}

.dashed{
  margin-left:50%;
  height: 800px;
  border-left: 2px dashed white;
}

#container:first-child .box{
  margin-top: 300px;
}

#container:last-child .dashed{
  display: none
}

#container:last-child .box{
  margin-bottom: 400px;
}

.box span{
  background-color: rgba(255,255,255,0.05);
  border: none;
  width: stretch;
  height: auto;
  color: white;
  font-family: 'Barlow', sans-serif;
  font-weight: 300;
}

.box p{
  border: none;
  width: stretch;
  height: auto;
  color: white;
  font-family: 'Barlow', sans-serif;
  font-weight: 300;
}

.title[contenteditable]:empty::before {
  content: "Enter an Title here";
  color: gray;
}

.caption[contenteditable]:empty::before {
  content: "Enter a caption here";
  color: gray;
}

.box span:focus{
  border: none;
  outline: none;
  background-color: rgba(255, 255, 255, 0.116);
}

.title{
  line-height: 40px;
  font-size: 30px;
  margin: 10px;
  margin-bottom: 0px;
  display: block;
}

.caption{
  margin: 10px;
  margin-top: 5px;
  line-height: 25px;
  font-size: 20px;
  display: block;
}

.titleText{
  line-height: 40px;
  font-size: 30px;
  margin: 10px;
  margin-bottom: 0px;
  display: block;
}

.captionText{
  margin: 10px;
  margin-top: 5px;
  line-height: 25px;
  font-size: 20px;
  display: block;
}

.infoWindow{
  max-height: 80vh;
}

#unfocus{
  position: absolute;
  top: 0px;
  left: 0px;
  width: 100vw;
  height: 100vh;
  background-color: rgba(255, 255, 255, 0.192);
  z-index: 100;
  display: none;
}

#display{
  position: absolute;
  z-index: 101;
  background-color: white;
  padding: 10px;
  border-radius: 10px;
  max-height: 80vh;
  max-width: calc(100vw - 500px);
  display: none;
}

.viewButton {
  margin: 10px;
  width: 100px;
  margin-left: 120px;
  border: 1px solid rgba(197, 197, 197);
  padding: 3px;
  color: rgb(197, 197, 197);
  background-color: rgb(36, 36, 36);
}

.viewButton:hover{
  background-color: rgb(99, 99, 99);
}

.datePicker{
  height: 30px;
  margin-left: 70px;
  width: 200px;
  border-radius: 5px;
}

.datePicker:disabled{
  color:white;
  background-color: rgba(0,0,0,0);
  border: none
}
</style>
