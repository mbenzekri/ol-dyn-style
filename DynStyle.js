import { Map as olMap } from 'ol';
import { Style, Fill, Stroke, Text, RegularShape, Icon, } from 'ol/style'
import VectorImageLayer from "ol/layer/VectorImage"
import GeoJSON from "ol/format/GeoJSON"
import VectorSource from "ol/source/Vector"
import CircleStyle from 'ol/style/Circle'

window.firstOf = function(...args) {
    if (args.length == 0) return null
    const selvalue = args.shift()
    const defvalue = args.length > 0 && args.length % 2 == 1 ? args.pop() : null
    for(let i=0;i< args.length;i+=2) {
        if (selvalue === args[i]) return args[i]
    }
    return defvalue
}
/**
 * collect a list of [pointer,value] walking through the given object "item" 
 * returns only the [pointer,value] that validate the filter callback  
 * @param {any} value - value to walk through
 * @param {(item) => boolean} filter - must return true to accept this value (false otherwise)
 * @param {string} pointer - pointer constructed during walk-through
 * @param {[pointer:string,value:any|any[]]} list - list of [pointer,value] constructed during walk-through
 * @returns {[pointer:string,value:any|any[]][]}
 */
function collect(value, filter, pointer = "", list = []) {
    if (value == null) return list
    switch (true) {
        case filter(value):
            list.push([pointer, value])
            break
        case Array.isArray(value) && value.length && value[0]:
            value.forEach((v, i) => collect(v, filter, `${pointer}/${i}`, list))
            break
        case typeof value == "object":
            Object.entries(value).forEach(([i, v]) => collect(v, filter, `${pointer}/${i}`, list))
            break
    }
    return list
}

function isGetter(obj, property) {
    const desc = Object.getOwnPropertyDescriptor(obj, property)
    return desc?.get != null
}


function toFunc(item) {
    if (Array.isArray(item)) {
        item = "=> { \n" + item.map(line => {
            const parts = line.substring(1).split(/=>/)
            const code = parts[0].startsWith("efault") ? `return (${parts[1]})` : `if (${parts[0]}) return (${parts[1]})`
            return code
        }).join(";\n") + " }"
    }
    return item
}


/**
 * @typedef DynStyleJSON
 * @type {object}
 * @property {{[name:string]: any}} constants - an ID.
 * @property {{[name:string]: any}} definitions - an ID.
 * @property {"geojson"|"shapefile","mapinfo","mifmid"} format - your name.
 * @property {number[]} scales - scales ranges from minscale to max scale.
 */
let COUNT = 0
let FCOUNT = 0
/**
 * Dynamic styling for Openlayers Vector source
 */
export class DynStyle {

    /** @type {string} */
    name = null

    /** @type {DynStyleJSON} */
    dynjson = null

    /** @type {Map<string,Style[]>} */
    cache = new Map()

    /** @type {boolean} */
    compiled = false

    /** @type {() => any} */
    userdataCb = () => void (0)

    /** @type {Promise[]} - promise for resource load (images, ...) */
    loading = []

    /** @type {[number,number]} - last scale */
    lastScaleRange = [0,0]

    context = []

    /**
     * helper function to : 
     * - load geojson data and dynamic style description
     * - create compile Style function from  style description
     * - create VectorLayer from loaded data with created style
     * - add the layer to the map 
     * @param {string} geojsonUrl 
     * @param {string} styleUrl 
     * @param {olMap} map 
     */

    static async load(geojsonUrl,styleUrl,map) {
        const vlayer = new VectorImageLayer({
            //background: 'rgb(255,255,255,0)',
            imageRatio: 2,
            source: new VectorSource({
                url: geojsonUrl,
                format: new GeoJSON(),
            })
        });
        const jsonstyle = await fetch(styleUrl).then(resp => resp.json())
        const dynstyle = new DynStyle('ZZZ',jsonstyle)
        const styleFunc = await dynstyle.compile()
        vlayer.setStyle(styleFunc)
        map.addLayer(vlayer)
    }

    /**
     * create a new DynStyle from json description
     * @param {string} name - layer name to created
     * @param {DynStyleJSON} jsonstyle - dynamic json description
     * @param {() => any} userdataCb - callback returning userdata to be used in dynamic styling (see variable "U") 
     */
    constructor(name, jsonstyle, userdataCb) {
        this.name = name ?? `LAYER${++COUNT}`
        this.dynjson = JSON.parse(JSON.stringify(jsonstyle)) ?? {}
        this.userdataCb = userdataCb ?? (() => { return {} })
        this.dynjson.debug ??= false
        this.dynjson.format ??= "geojson"
        this.dynjson.group ??= this.name
        this.dynjson.title ??= `Layer ${this.name}`
        this.dynjson.id ??= null
        this.dynjson.crs ??= "EPSG:4326"
        this.dynjson.scales ??= [0, 100000000]
        this.dynjson.scales.sort((a, b) => a - b)
        this.dynjson.cacheKey ??= 'DEFAULT'
        this.dynjson.visible ??= true
        this.dynjson.static ??= {}
        this.dynjson.dynamic ??= []
        for (const ostyle of Object.values(this.dynjson.static)) {
            ostyle.when ??= "=> true"
            for (const item of Object.values(ostyle)) {
                if (typeof item === 'object') item.when ??= "=> true"
            }
        }
    }

    /** @type {(F:Feature,R:number) => Style[]} */
    get styleFunc() {
        return (F, R) => {
            const scale = this.scale(F, R)
            if (scale < this.minscale || scale >= this.maxscale) return null
            this.setContext(F, R)
            if (this.lastScaleRange[0] !== this.context[3] || this.lastScaleRange[1] !== this.context[4] ) {
                this.lastScaleRange = [this.context[3] , this.context[4] ]
                this.log(`current scale range => [${this.lastScaleRange.join("-")}]`)
            }
            const key = this.dynjson.cacheKey
            let styles = []
            if (this.cache.has(key.toString())) {
                // style in cache get it
                styles = this.cache.get(key.toString())
                //this.log(`style hit [${this.context[3]},${this.context[4]}] [${key.toString()}] => (${styles.map(x => x.name).join('/')})`)
            } else {
                // create the style
                styles = this.styles
                // put style created in cache
                this.log(`style cached [${key.toString()}] => (${styles.map(x => x.name).join('/')})`)
                this.cache.set(key.toString(), styles)
            }
            this.setDynamics(styles)
            return styles
        }
    }

    /** @type {Style[]} */
    get styles() {
        const staticStyles = this.dynjson.static
        const styles = []
        for (const [oname, ostyle] of Object.entries(staticStyles)) {
            if (ostyle.when) {
                // style created only when "when" clause is true
                const fill = this.createFill(ostyle.fill)
                const stroke = this.createStroke(ostyle.stroke)
                const image = this.createImage(ostyle.image)
                const text = this.createText(ostyle.text)

                // add to style list
                const style = new Style({ fill, stroke, image, text })
                style.name = oname
                styles.push(style)
            }
        }
        return styles
    }
    get constants() {
        return this.dynjson?.constants ?? {}
    }
    get definitions() {
        return this.dynjson?.definitions ?? {}
    }
    get minscale() {
        return this.dynjson.scales[0] ?? 0
    }
    get maxscale() {
        return this.dynjson.scales[this.dynjson.scales.length - 1] ?? 100_000_000
    }
    setContext(F, R) {
        const SCALE = this.scale(F, R)
        const [LSCALE, USCALE] = this.rangeScale(SCALE)
        const D = this.definitions
        const C = this.constants
        const U = this.userdataCb()
        this.context = [F, R, SCALE, LSCALE, USCALE, D, C, U]
    }


    scale(feature, resolution) {
        const INCHES_PER_UNIT = { 'm': 39.37, 'dd': 4374754 };
        const DOTS_PER_INCH = 90;
        const scale = INCHES_PER_UNIT['m'] * DOTS_PER_INCH * resolution;
        return scale
    }

    rangeScale(mapscale) {
        let lscale
        for (const scale of this.dynjson.scales) {
            if (mapscale > scale) lscale = scale
            if (mapscale <= scale) return [lscale, scale]
        }
    }

    deref(pointer) {
        let base = this.dynjson
        const keys = pointer.replace(/^\/*/, '').split(/\//)
        const key = keys.pop()
        for (const k of keys) base = base[k]
        return [base, key]
    }

    compileFunctions() {
        const filter = (item) => {
            if (item == null) return false
            if (typeof item == "string" && item.startsWith("=>")) return true
            if (Array.isArray(item) && item.length && typeof item[0] === 'string' && item[0].startsWith("?")) return true
            return false
        }
        const tocompile = collect(this.dynjson, filter).map(([pointer, funcstr]) => [pointer, toFunc(funcstr)])
        for (const [pointer, funcstr] of tocompile) {
            const [base, key] = this.deref(pointer)
            const code = `(function f() {
                    //# sourceURL=dynamic/${this.name}${pointer.replace(/[^A-Z0-9a-z]+/g, "_")}.js;"
                    const COMPILED = (F,R,SCALE,LSCALE,USCALE,D,C,U) ${funcstr} ;
                    return COMPILED(...this.context);
                })`
            try {
                const func = eval(code)
                Object.defineProperty(base, key, {
                    get: func.bind(this)
                })
            }
            catch (e) {
                console.error("Compilation failure on code :\n---BEGIN---\n%s\n---END ---", code, String(e))
            }
        }
    }

    compileImages() {
        const filter = (val) => typeof val === 'string' && /^\s*<svg/i.test(val)
        const tocompile = collect(this.dynjson, filter)
        for (const [pointer, svg] of tocompile) {
            const img =  this.getImage(pointer,svg)
            const [base, key] = this.deref(pointer)
            base[key] = img
        }
    }

    compileDefinitions() {
        // foreach entry in definitions which is not function , compile to Style creation function Function 
        for (const defname of Object.keys(this.definitions)) {
            const desc = Object.getOwnPropertyDescriptor(this.definitions, defname)
            if (desc.get == null) {
                const defvalue = this.definitions[defname]
                Object.defineProperty(this.definitions, defname, {
                    get: () => defvalue?.type != null ? this[`create${defvalue.type}`](defvalue) : defvalue
                })
            }
        }
    }
    setDynamics(styles) {
        // change dynamic value described in dynamic entries
        for (const patch of this.dynjson.dynamic) {
            const pointer = patch.pointer
            const value = patch.value
            for (const style of styles) {
                const keys = pointer.substring(2).split("/")
                const name = keys.shift()
                const key = keys.pop()
                if (name !== '*' && style.name !== name ) continue
                let current = style
                try {
                    for (const prop of keys) {
                        const cap = `${prop.charAt(0).toUpperCase()}${prop.slice(1)}`
                        if (current != null && (`get${cap}` in current)) current = current[`get${cap}`]();
                    }
                    const cap = `${key.charAt(0).toUpperCase()}${key.slice(1)}`
                    if (current != null && (`set${cap}` in current)) current[`set${cap}`](value)
                } catch (e) {
                }
            }
        }
    }

    getImage(pointer,source) {
        var img = new Image();
        img.pointer = pointer
        this.loading.push(new Promise((resolve) => {
            img.onload = resolve
            img.onerror = (e) => { this.log(`unable to load Img ${img.pointer} due to: ${e.message}`); resolve() }
        }))
        const type = /^\s*<svg/.test(source) ? "svg" : "url"
        if (type === "svg") img.src = `data:image/svg+xml,${escape(source)}`
        if (type === "url") img.src = source
        return img;
    }
    styleColor(property, options) {
        const color = options[property]
        if (color == null || Array.isArray(color) || typeof color != "object") return
        switch (color.type) {
            case "CanvasPattern": return options[property] = this.createCanvasPattern(color)
            case "LinearGradient": return options[property] = this.createLinearGradient(color)
            case "RadialGradient": return options[property] = this.createRadialGradient(color)
            case "ConicGradient": return options[property] = this.createConicGradient(color)
        }
    }
    createConicGradient() {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const gradient = context.createConicGradient(color.startAngle, color.x, opts.y)
        return gradient
    }
    createLinearGradient(color) {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const gradient = context.createLinearGradient(color.x0, color.y0, color.x1, color.y1)
        return gradient
    }
    createRadialGradient(color) {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const gradient = context.createRadialGradient(color.x0, color.y0, color.r0, color.x1, color.y1, color.r1)
        return gradient

    }
    createCanvasPattern(color) {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const pattern = context.createPattern(color.img, color.repetition)
        return pattern
    }
    createFill(fillopts) {
        if (fillopts == null) return null
        if (fillopts instanceof Fill) return fillopts
        const options = Object.assign({}, fillopts)
        if (options.when === false) return null
        this.styleColor('color', options)
        return new Fill(options)
    }
    createStroke(strokeopts) {
        if (strokeopts == null) return null
        if (strokeopts instanceof Stroke) return strokeopts
        const options = Object.assign({}, strokeopts)
        if (options.when === false) return null
        this.styleColor('color', options)
        return new Stroke(options)
    }
    createImage(imageopts) {
        if (imageopts == null) return null
        if (imageopts instanceof Icon) return imageopts
        if (imageopts instanceof RegularShape) return imageopts
        if (imageopts instanceof CircleStyle) return imageopts
        switch (imageopts.type) {
            case "Icon": return this.createIcon(imageopts)
            case "RegularShape": return this.createRegularShape(imageopts)
            case "Circle": return this.createCircle(imageopts)
        }
        return null
    }
    createIcon(imageopts) {
        if (imageopts == null) return null
        if (imageopts instanceof Icon) return imageopts
        const options = Object.assign({}, imageopts)
        if (options.when === false) return null
        this.styleColor("color", options)
        return new Icon(options)
    }
    createRegularShape(imageopts) {
        if (imageopts == null) return null
        if (imageopts instanceof RegularShape) return imageopts
        const options = Object.assign({}, imageopts)
        if (options.when === false) return null
        options.fill = this.createFill(options.fill)
        options.stroke = this.createStroke(options.stroke)
        return new RegularShape(options)
    }
    createCircle(imageopts) {
        if (imageopts == null) return null
        if (imageopts instanceof CircleStyle) return imageopts
        const options = Object.assign({}, imageopts)
        if (options.when === false) return null
        options.fill = this.createFill(options.fill)
        options.stroke = this.createStroke(options.stroke)
        return new CircleStyle(options)

    }
    createText(textopts) {
        if (textopts == null) return null
        if (textopts instanceof Text) return textopts
        const options = Object.assign({}, textopts)
        if (options.when === false) return null
        options.fill = this.createFill(options.fill)
        options.stroke = this.createStroke(options.stroke)
        options.backgroundFill = this.createFill(options.backgroundFill)
        options.backgroundStroke = this.createStroke(options.backgroundStroke)
        return new Text(options)
    }
    async compile() {
        this.compileImages()
        this.compileFunctions()
        return Promise.all(this.loading).then(_all => {
            this.log(`${_all.length} svg images loaded`)
            this.compileDefinitions()
            this.compiled = true
            return this.styleFunc
        })
    }
    log(str) {
        if (this.dynjson.debug) console.log(this.name,' : ',str)
    }
}