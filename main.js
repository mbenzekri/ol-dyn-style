import './style.css';
import { Map, View } from 'ol';
import VectorImageLayer from 'ol/layer/VectorImage';
import VectorSource from 'ol/source/Vector';
import {Fill,Stroke, Style} from 'ol/style';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON'
import {DynStyle} from "./DynStyle";
import simple_tronco from "./styles/tronco-style.json";
import simple_noeud from "./styles/noeud-style.json";
import Point from "ol/geom/Point"


const ds_tronco = new DynStyle('E_TRONCO',simple_tronco)
const ds_noeud = new DynStyle('E_TRONCO',simple_noeud)

const osm =new TileLayer({
    source: new OSM()
})


const worldStyle = new Style({
    fill: null,
    stroke: new Stroke({
        color: '#448044',
        width: 2
    }),
});

const troncoStyle = new Style({
    fill: null,
    stroke: new Stroke({
        color: '#0000FF',
        width: 2
    }),
});

const world = new VectorImageLayer({
    background: 'rgb(255,255,255,0)',
    imageRatio: 2,
    source: new VectorSource({
        url: './data/countries.geojson',
        format: new GeoJSON(),
    }),
    style: worldStyle
});

const E_TRONCO = new VectorImageLayer({
    background: 'rgb(255,255,255,0)',
    imageRatio: 2,
    source: new VectorSource({
        url: './data/E_TRONCO.geojson',
        format: new GeoJSON(),
    }),
    style: ds_tronco.style
});
const E_NOEUD = new VectorImageLayer({
    background: 'rgb(255,255,255,0)',
    imageRatio: 2,
    source: new VectorSource({
        url: './data/E_NOEUD.geojson',
        format: new GeoJSON(),
    }),
    style: ds_noeud.style
});



const map = new Map({
    target: 'map',
    layers: [
        osm,
        world,
        E_TRONCO,
        E_NOEUD
    ],
    view: new View({
        center: [ 0, 0 ],
        zoom: 14
    })
})
const center = new Point([ 2.13, 48.69463220471012]).transform('EPSG:4326', map.getView().getProjection());
map.getView().setCenter(center.flatCoordinates)
