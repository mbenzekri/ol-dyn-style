import {Style, Fill, Stroke, Image, Text, RegularShape,  Icon,} from 'ol/style'
import CircleStyle from 'ol/style/Circle'

/**
 * 
 * @param {any} item 
 * @param {string} path 
 * @param {[path:string,func:string][]} compiled 
 * @returns {[path:string,func:string][]}
 */
function compileFunctions(item,path="",compiled = []) {
    if (item == null) return compiled
    if (Array.isArray(item)) {
        item.forEach( (v,i) => compileFunctions(v,`${path}/${i}`,compiled))
        return compiled
    }
    if (typeof item == "object") {
        Object.entries(item).forEach( ([i,v]) => compileFunctions(v,`${path}/${i}`,compiled))
        return compiled
    }
    if (typeof item == "string" && item.startsWith("=>")) {
        compiled.push([path,item])
        return compiled
    } 
    return compiled
}

var svgImage = function (svgxml) {
    var img = new Image();
    img.src = 'data:image/svg+xml,' + escape(svgxml);
    return img;
};


/**
 * @typedef DynStyleJSON
 * @type {object}
 * @property {{[name:string]: any}} constants - an ID.
 * @property {{[name:string]: any}} definitions - an ID.
 * @property {"geojson"|"shapefile","mapinfo","mifmid"} format - your name.
 * @property {number[]} scales - scales ranges from minscale to max scale.
 */
let COUNT =0
/**
 * Dynamic styling for Openlayers Vector source
 */
export class DynStyle {

    /** @type {string} */
    name= null

    /** @type {DynStyleJSON} */
    dynjson= null

    /** @type {Map<string,Style[]>} */
    cache=new Map()

    /** @type {boolean */
    compiled= false

    constructor(name,jsonstyle) {
        this.name = name ?? `LAYER${++COUNT}`
        this.dynjson = JSON.parse(JSON.stringify(jsonstyle)) ?? {}
        if (this.dynjson.scales == null) this.dynjson.scales = [0,100000000]
        this.dynjson.scales.sort()
        this.styleFunc = this.compile()
    }

    /** @type {(F:Feature,R:number) => Style[]} */
    get style() {
        return this.styleFunc
    }
    styleColor(property,options) {
        const color = options[property] 
        if (color == null || Array.isArray(color) || typeof color != "object") return 
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (color.image != null) {
            // CanvasPattern
            const image = svgImage(options.img)
            const pattern = context.createPattern(image, color.repetition)
            options[property] = pattern
        }
        if (color.startAngle != null) {
            // LinearGradient
            const gradient = context.createConicGradient(color.startAngle, color.x, opts.y)
            options[property] = gradient
        }
        if (color.x0 != null && color.r0 === undefined) {
            // LinearGradient
            const gradient = context.createLinearGradient(color.x0, color.y0, color.x1, color.y1)
            options[property] = gradient
        }
        if (color.x0 != null && color.r0 != null) {
            // RadialGradient
            const gradient = context.createRadialGradient(color.x0, color.y0, color.r0, color.x1, color.y1, color.r1)
            options[property] = gradient
        }
    } 

    /** @type {Style[]} */
    get styles() {
        const staticStyles = this.dynjson.static
        const styles = [] 
        for (const ostyle of staticStyles) {
            let fill = null
            let stroke = null
            let image = null
            let text = null

            // create Fill
            if (ostyle.fill != null) { 
                const options = Object.assign({},ostyle.fill)
                this.styleColor('color',options) 
                fill = ostyle.fill != null ? new Fill(ostyle.fill) : undefined
            } else 
            // create Stroke
            if (ostyle.stroke != null) { 
                const options = Object.assign({},ostyle.image)
                this.styleColor('color',options) 
                stroke = ostyle.stroke != null ? new Stroke(ostyle.stroke) : undefined
            }
            // create Image
            if (ostyle.image != null) { 
                switch(true) {
                    case ostyle.image.img != null: {  // Icon 
                        const options = Object.assign({},ostyle.image)
                        this.styleColor("color",options)
                        options.img = svgImage(options.img)
                        image = new Icon(options)
                        }
                        break
                    case ostyle.image.points != null: { // RegularShape
                        const options = Object.assign({},ostyle.image)
                        if (options.fill != null) {
                            options.fill = new Fill(Object.assign({},options.fill))
                            this.styleColor('color',options.fill)
                        } else options.fill = null
                        if (options.stroke != null) {
                            options.stroke = new Stroke(Object.assign({},options.stroke))
                            this.styleColor('color',options.stroke)
                        } else options.stroke = null
                        image = new RegularShape(options)
                    }
                    break
                    case ostyle.image.radius != null: { // CircleStyle
                        const options = Object.assign({},ostyle.image)
                        if (options.fill != null) {
                            options.fill = new Fill(Object.assign({},options.fill))
                            this.styleColor('color',options.fill)
                        } 
                        if (options.stroke != null) {
                            options.stroke = new Stroke(Object.assign({},options.stroke))
                            this.styleColor('color',options.stroke)
                        } else options.stroke = null
                        image = new CircleStyle(options)
                    }
                }
            }

            // create Text
            if (ostyle.text != null) { 
                const options = Object.assign({},ostyle.text)
                options.fill = new Fill(Object.assign({},options.fill))
                this.styleColor('color',options.fill)
                options.stroke = new Stroke(Object.assign({},options.stroke))
                this.styleColor('color',options.stroke)

                options.backgroundFill = new Fill(Object.assign({},options.backgroundFill))
                this.styleColor('color',options.backgroundFill)
                options.backgroundStroke = new Stroke(Object.assign({},options.backgroundStroke))
                this.styleColor('color',options.backgroundStroke)
                text = new Text(options)
            }

            // add to style list
            styles.push(new Style({fill,stroke,image,text}))
        }
        return styles
    }
    get constants() {
        return this.dynjson?.definitions ?? {}
    }
    get definitions() {
        return this.dynjson?.definitions ?? {}
    }
    get minscale() {
        return this.dynjson.scales[0] ?? 0
    }
    get maxscale() {
        return this.dynjson.scales[this.dynjson.scales.length-1] ?? 100_000_000
    }
    get compiledFunctions() {
        return compileFunctions(this.dynjson)
    }
    scale(feature, resolution) {
        const INCHES_PER_UNIT = { 'm': 39.37, 'dd': 4374754 };
        const DOTS_PER_INCH = 90;
        const scale = INCHES_PER_UNIT['m'] * DOTS_PER_INCH * resolution;
        return scale
    }

    load(url) {
        // load data and return styled vector layer
    }
    rangeScale(mapscale) {
        let lscale
        for(const scale of this.dynjson.scales) {
            if(mapscale > scale) lscale = scale
            if(mapscale <= scale) return [lscale,scale]
        }
    }

    setPointer(path,func) {
        const base = ds.dynjson
        const keys = [...path]
        const key = keys.pop()
        for(k of keys) base = base[k]
        Object.defineProperty(base, key, {
            get: func
        })
    }
    patchStyles() {
        return " // TO BE DONE"
        // change dynamic value described in dynamic entries
        // style[0].getText().setText(ds.dynjson.dynamic['#/0/text/text'])
    }

    compile() {
        const code = [
            `(ds) => {`,
            ` //# sourceURL=${this.name}-style.js`,
            `   return function(F,R) {`,
            `       const scale = ds.scale(F,R)`,
            `       if (scale < ds.minscale || scale >= ds.maxscale) return null`,
            `       const D = ds.definitions`,
            `       const C = ds.constants`,
            `       const [LSCALE,USCALE] = ds.rangeScale(scale)`,
            `       if (!ds.compiled) (function() {`,
            this.compiledFunctions.map(
                ([path,fstr]) => `           ds.setPointer('${path}',() ${fstr});`
            ).join("\n"),
            `       }())`,
            `       ds.compiled = true`,
            `       const key = ds.compiled.cacheKey`,
            `       let styles = []`,
            `       if (ds.cache.has(key)) {`,
            `           // style in cache get it`,
            `           styles = ds.cache.get(key)`,
            `       } else {`,
            `           // create the style`,
            `           styles = ds.styles`,
            `           // put style created in cache`,
            `           ds.cache.set(key,styles)`,
            `       }`,
            `       if (styles != null) {`,
            this.patchStyles(),
            `       }`,
            `       return styles`,
            `   }`,
            `}`,
        ].join("\n")
        const closure = eval(code)
        return closure(this)
    }
}