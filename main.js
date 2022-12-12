import './style.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import Point from 'ol/geom/Point'
import { DynStyle } from "./DynStyle";


const osm = new TileLayer({ source: new OSM() })


const center = new Point([2.2898757475124834, 48.834372174636115]).transform('EPSG:4326', "EPSG:3857");
const map = new Map({
    target: 'map',
    layers: [ osm ],
    view: new View({
        center: center.flatCoordinates,
        zoom: 14
    })
})

DynStyle.load("./data/OSM-IDF-POIS.geojson", "./styles/OSM-IDF-POIS-styles.json", map)
const last = JSON.parse(localStorage.getItem("ZOOM") ?? "null")
if (last) {
    map.getView().setCenter(last.center)
    map.getView().setZoom(last.zoom)
} else {
    localStorage.setItem("ZOOM", JSON.stringify({ zoom: 14, center: center.flatCoordinates }))
}

var currZoom = map.getView().getZoom();
var currCenter = map.getView().getCenter();
map.on('moveend', function (e) {
    var newZoom = map.getView().getZoom();
    var newCenter = map.getView().getCenter();
    if (currZoom != newZoom || currCenter[0] != newCenter[0] || currCenter[1] != newCenter[1]) {
        console.log('zoom end, new zoom: ' + newZoom);
        localStorage.setItem("ZOOM", JSON.stringify({ zoom: newZoom, center: newCenter }))
        currZoom = newZoom
        currZoom = newCenter;
    }
});