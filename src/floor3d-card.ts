import {
  LitElement,
  html,
  customElement,
  property,
  CSSResult,
  TemplateResult,
  css,
  PropertyValues,
  internalProperty,
} from 'lit-element';
import {
  HomeAssistant,
  hasConfigOrEntityChanged,
  hasAction,
  ActionHandlerEvent,
  handleAction,
  LovelaceCardEditor,
  getLovelace,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types

import './editor';
import { mergeDeep, hasConfigOrEntitiesChanged, createConfigArray } from './helpers';
import type { Floor3dCardConfig, EntityFloor3dCardConfig } from './types';
//import { actionHandler } from './action-handler-directive';
import { CARD_VERSION } from './const';
import { localize } from './localize/localize';
//import three.js libraries for 3D rendering
import * as THREE from 'three';
import { Projector } from 'three/examples/jsm/renderers/Projector';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { Material } from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls';
import { Sky } from 'three/examples/jsm/objects/Sky';
import { NotEqualStencilFunc, Object3D } from 'three';


/* eslint no-console: 0 */
console.info(
  `%c  FLOOR3D-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'floor3d-card',
  name: 'Floor3d Card',
  description: 'A template custom card for you to create something awesome',
});

// TODO Name your custom element
@customElement('floor3d-card')
export class Floor3dCard extends LitElement {

  private _scene?: THREE.Scene;
  private _camera?: THREE.PerspectiveCamera;
  private _renderer?: THREE.WebGLRenderer;
  private _controls?: OrbitControls;
  private _modelX?: number;
  private _modelY?: number;
  private _modelZ?: number;

  private _states?: string[];
  private _color?: number[][];
  private _brightness?: number[];

  private _firstcall?: boolean;
  private _card?: HTMLElement;
  private _content?: HTMLElement;

  private _config!: Floor3dCardConfig;
  private _configArray: Floor3dCardConfig[] = [];

  constructor() {

    super();

    console.log('New Card')

  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('floor3d-card-editor');
  }

  public static getStubConfig(): object {
    return {};
  }

  // TODO Add any properities that should cause your element to re-render here
  // https://lit-element.polymer-project.org/guide/properties
  //@property({ attribute: false }) public hass!: HomeAssistant;
  @internalProperty() private config!: Floor3dCardConfig;

  // https://lit-element.polymer-project.org/guide/properties#accessors-custom
  public setConfig(config: Floor3dCardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    console.log('Set Config');

    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    /*    if (config.test_gui) {
          getLovelace().setEditMode(true);
        }

        this._config = mergeDeep(
          {
            appearance: {
              backgroundColor: '#aaaaaa',
              globalLightPower: 0.5,
              style: '',
            },
            model: {
              name: 'Home',
              path: '/local/',
              objfile: '',
              mtlfile: '',
            }
          },
          config,
        );
        */
    this._config = config;
    this._configArray = createConfigArray(this._config);


    if (!this._renderer) {
      console.log('Renderer not instanciated');
      this.display3dmodel();
    }
  }

  public rerender(): void {

    this._renderer.domElement.remove();
    this._renderer = null;
    this._card = null;
    this._content = null;
    ;

    this._states = null;
    this.display3dmodel();

  }

  private _ispanel(): boolean {

    let root: any = document.querySelector('home-assistant');
    root = root && root.shadowRoot;
    root = root && root.querySelector('home-assistant-main');
    root = root && root.shadowRoot;
    root = root && root.querySelector('app-drawer-layout partial-panel-resolver');
    root = root && root.shadowRoot || root;
    root = root && root.querySelector('ha-panel-lovelace');
    root = root && root.shadowRoot;
    root = root && root.querySelector('hui-root');
    root = root && root.shadowRoot;
    root = root && root.querySelector('ha-app-layout');

    const panel: [] = root.getElementsByTagName('HUI-PANEL-VIEW');

    if (panel.length == 0) {
      return false;
    } else {
      return true;
    }
  }

  getCardSize(): number {
    if (this._renderer) {
      return this._renderer.domElement.height / 50;
    }
    else {
      return 10;
    }
  }

  private _firstUpdated(): void {

    console.log('First updated start');

    if (!this._card) {

      console.log('Card not instatiated');

      this._card = this.shadowRoot.getElementById('ha-card-1');


      if (!this._ispanel()) {
        (this._card as any).header = this._config.name ? this._config.name : "Floor 3d";
      }

    }

    if (!this._content) {
      console.log('Div not instanciated');
      this._content = this.shadowRoot.getElementById('3d_canvas');
      this._content.style.width = '100%'
      this._content.style.height = '100%'
      //console.log(this._content.id)
    }

    this._content.appendChild(this._renderer.domElement)
    window.addEventListener("resize", this._resizeCanvas.bind(this));
    this._content.addEventListener("dblclick", this._showObjectName.bind(this));
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.maxPolarAngle = 0.9 * Math.PI / 2;
    this._controls.addEventListener('change', this._render.bind(this));
    this._scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5));
    this._renderer.render(this._scene, this._camera);
    this._resizeCanvas();
    console.log('First updated end');
  }

  private _render(): void {
    this._renderer.render(this._scene, this._camera);
  }

  private _showObjectName(e: any): void {

    const mouse: THREE.Vector2 = new THREE.Vector2();
    mouse.x = (e.offsetX / this._content.clientWidth) * 2 - 1;
    mouse.y = - (e.offsetY / this._content.clientHeight) * 2 + 1;
    const raycaster: THREE.Raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this._camera);
    const intersects: THREE.Intersection[] = raycaster.intersectObjects(this._scene.children, true);
    if (intersects.length > 0 && intersects[0].object.name != '') {
      window.prompt("Object:", intersects[0].object.name);
    }
  }

  private _resizeCanvas(): void {
    // Resize 3D canvas
    //console.log('Resize canvas start');
    console.log('Card: Width ' + this._card.clientWidth + ' Height: ' + this._card.clientHeight);
    console.log('Div: Width ' + this._content.clientWidth + ' Height: ' + this._content.clientHeight);
    console.log('Canvas: CWidth ' + this._renderer.domElement.clientWidth + ' CHeight: ' + this._renderer.domElement.clientHeight);
    console.log('Canvas: Width ' + this._renderer.domElement.width + ' Height: ' + this._renderer.domElement.height);
    if ((this._renderer.domElement.clientWidth !== this._renderer.domElement.width) || (this._renderer.domElement.clientHeight !== this._renderer.domElement.height)) {
      this._camera.aspect = this._renderer.domElement.clientWidth / this._renderer.domElement.clientHeight;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(this._renderer.domElement.clientWidth, this._renderer.domElement.clientHeight, true);
      this._renderer.render(this._scene, this._camera);
    }
    //console.log('Resize canvas end');
  }

  public set hass(hass: HomeAssistant) {

    if (this._config.entities) {
      if (!this._states) {
        console.log('Hass State Change Init')
        this._states = [];
        this._color = [];
        this._brightness = [];
        //console.log(JSON.stringify(this._config.entities));
        this._config.entities.forEach((entity) => {
          this._states.push(hass.states[entity.entity].state);
          if (hass.states[entity.entity].attributes['rgb_color']) {
            this._color.push(hass.states[entity.entity].attributes['rgb_color']);
          } else {
            this._color.push([]);
          }
          if (hass.states[entity.entity].attributes['brightness']) {
            this._brightness.push(hass.states[entity.entity].attributes['brightness']);
          } else {
            this._brightness.push(-1);
          }
        });
        this._firstcall = false;
      }
      else {
        let torerender = false;
        this._config.entities.forEach((entity, i) => {
          if (entity.type3d == 'light') {
            let toupdate = false;
            if (this._states[i] !== hass.states[entity.entity].state) {
              this._states[i] = hass.states[entity.entity].state;
              toupdate = true;
            }
            if (hass.states[entity.entity].attributes['rgb_color']) {
              if (hass.states[entity.entity].attributes['rgb_color'] !== this._color[i]) {
                toupdate = true;
                this._color[i] = hass.states[entity.entity].attributes['rgb_color'];
              }
            }
            if (hass.states[entity.entity].attributes['brightness']) {
              if (hass.states[entity.entity].attributes['brightness'] !== this._brightness[i]) {
                toupdate = true;
                this._brightness[i] = hass.states[entity.entity].attributes['brightness'];
              }
            }
            if (toupdate) {
              this._updatelight(entity, this._states[i], this._color[i], this._brightness[i]);
              torerender = true;
            }
          }
          else if (this._states[i] !== hass.states[entity.entity].state) {
            this._states[i] = hass.states[entity.entity].state;
            if (entity.type3d == 'color') {
              this._updatecolor(entity, this._states[i]);
              torerender = true;
            } else if (entity.type3d == 'hide') {
              this._updatehide(entity, this._states[i]);
              torerender = true;
            }
          }
        });
        if (torerender) {
          this._render();
        }
      }
    }

  }

  protected display3dmodel(): void {

    console.log('Start Build Renderer');
    this._scene = new THREE.Scene();
    if (this._config.backgroundColor && this._config.backgroundColor != '#000000') {
      this._scene.background = new THREE.Color(this._config.backgroundColor);
    } else {
      this._scene.background = new THREE.Color('#aaaaaa');
    }
    this._camera = new THREE.PerspectiveCamera(45, 1, 0.1, 99999999,);
    this._scene.add(this._camera);
    let hemiLight: THREE.HemisphereLight;

    if (this._config.globalLightPower) {
      hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, this._config.globalLightPower);
    } else {
      hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.3);
    }
    this._scene.add(hemiLight);
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.domElement.style.width = '100%';
    this._renderer.domElement.style.height = '100%';
    this._renderer.domElement.style.display = 'block';
    //this._canvasdiv.appendChild( this._renderer.domElement );

    if (this._config.mtlfile && this._config.mtlfile != '') {

      const mtlLoader: MTLLoader = new MTLLoader();
      mtlLoader.setPath(this._config.path);
      mtlLoader.load(this._config.mtlfile, this._onLoaded3DMaterials.bind(this), this._onLoadMaterialProgress.bind(this)
        , function (error: ErrorEvent) {
          throw new Error(error.error);
        });

    } else {
      const objLoader: OBJLoader = new OBJLoader();
      objLoader.load(this._config.path + this._config.objfile, this._onLoaded3DModel.bind(this), this._onLoadObjectProgress.bind(this), function (error: ErrorEvent): void {
        throw new Error(error.error);
      });
    }

    console.log('End Build Renderer');

  }

  private _onLoadMaterialProgress(_progress: ProgressEvent): void {
    return
  }

  private _onLoadObjectProgress(_progress: ProgressEvent): void {
    return
  }

  private _onLoaded3DModel(object: THREE.Object3D): void {
    // Object Loaded Event: last root object passed to the function
    console.log('Object loaded start');
    const box: THREE.Box3 = new THREE.Box3().setFromObject(object);
    this._camera.position.set(box.max.x * 1.3, box.max.y * 1.3, box.max.z * 1.3);
    this._modelX = object.position.x = -(box.max.x - box.min.x) / 2;
    this._modelY = object.position.y = - box.min.y;
    this._modelZ = object.position.z = -(box.max.z - box.min.z) / 2;
    this._scene.add(object);
    this._camera.lookAt(object.position);
    this._add3dObjects();
    this._firstUpdated();
    console.log('Object loaded end');
  }

  private _onLoaded3DMaterials(materials: MTLLoader.MaterialCreator): void {
    // Materials Loaded Event: last root material passed to the function
    console.log('Material loaded start');
    materials.preload();
    const objLoader: OBJLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(this._config.path + this._config.objfile, this._onLoaded3DModel.bind(this), function (_progress: ProgressEvent) {
      return
    }, function (error: ErrorEvent): void {
      throw new Error(error.error);
    });
    console.log('Material loaded end');
  }

  /*
  private _animate(): void {
    requestAnimationFrame(this._animate.bind(this));
    this._render();
    this._controls.update();
  }*/

  private _add3dObjects(): void {

    // Add-Modify the objects bound to the entities in the card config
    if (this._states && this._config.entities) {
      this._config.entities.forEach((entity, i) => {


        const _foundobject: any = this._scene.getObjectByName(entity.object_id)

        if (_foundobject) {
          if (entity.type3d == 'light') {

            const box: THREE.Box3 = new THREE.Box3();
            box.setFromObject(_foundobject);
            const light: THREE.PointLight = new THREE.PointLight(new THREE.Color('#ffffff'), 0, 300, 2);
            light.position.set((box.max.x - box.min.x) / 2 + box.min.x + this._modelX, (box.max.y - box.min.y) / 2 + box.min.y + this._modelY, (box.max.z - box.min.z) / 2 + box.min.z + this._modelZ);
            light.castShadow = true;
            light.name = entity.light.light_name;
            this._scene.add(light);
            this._updatelight(entity, this._states[i], this._color[i], this._brightness[i]);
          } else if (entity.type3d == 'color') {
            _foundobject.material = _foundobject.material.clone();
            this._updatecolor(entity, this._states[i]);
          } else if (entity.type3d == 'hide') {
            this._updatehide(entity, this._states[i]);
          }
        }
      });
    }
    console.log('Add 3D Object End');
  }

  private _RGBToHex(r: number, g: number, b: number): string {
    // RGB Color array to hex string converter
    let rs: string = r.toString(16);
    let gs: string = g.toString(16);
    let bs: string = b.toString(16);

    if (rs.length == 1)
      rs = "0" + rs;
    if (gs.length == 1)
      gs = "0" + gs;
    if (bs.length == 1)
      bs = "0" + bs;

    return "#" + rs + gs + bs;
  }

  private _updatelight(item: Floor3dCardConfig, state: string, color: number[], brightness: number): void {
    // Illuminate the light object when, for the bound device, one of its attribute gets modified in HA. See set hass property
    const light: any = this._scene.getObjectByName(item.light.light_name);
    if (!light) {
      return
    }
    let max: number;

    if (item.light.lumens) {
      max = item.light.lumens;
    } else {
      max = 800;
    }

    if (state == 'on') {
      if (brightness != -1) {
        light.intensity = 0.01 * max * brightness / 255;
      } else {
        light.intensity = 0.01 * max;
      }
      if (color.length == 0) {
        light.color = new THREE.Color('#ffffff');
      }
      else {
        light.color = new THREE.Color(this._RGBToHex(color[0], color[1], color[2]));
      }
    } else {
      light.intensity = 0;
      //light.color = new THREE.Color('#000000');
    }
  }

  private _updatecolor(item: any, state: string): void {
    // Change the color of the object when, for the bound device, the state matches the condition

    const _object: any = this._scene.getObjectByName(item.object_id);

    let i: any;

    for (i in item.colorcondition) {
      if (state == item.colorcondition[i].state) {
        _object.material.color.set(item.colorcondition[i].color);
        return;
      }
    }
  }


  private _updatehide(item: Floor3dCardConfig, state: string): void {

    const _object: any = this._scene.getObjectByName(item.object_id);

    if (state == item.hide.state) {
      _object.visible = false;
    } else {
      _object.visible = true;
    }

  }


  // https://lit-element.polymer-project.org/guide/lifecycle#shouldupdate
  protected shouldUpdate(_changedProps: PropertyValues): boolean {

    //console.log(JSON.stringify(changedProps))

    if (!this._config) {
      return false;
    }

    return true;
    //return hasConfigOrEntityChanged(this, changedProps, false);
  }

  // https://lit-element.polymer-project.org/guide/templates
  protected render(): TemplateResult | void {
    // TODO Check for stateObj or other necessary things and render a warning if missing
    console.log('Render start');
    if (this._config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    if (this._config.show_error) {
      return this._showError(localize('common.show_error'));
    }

    console.log('Render end');

    return html`
      <ha-card tabindex="0" .style=${`${this._config.style || 'width: auto; height: auto'}`} id="ha-card-1">
        <div id='3d_canvas' style='width: 100%; height: 100%'>
        </div>
        <ha-dialog id="ha-dialog-progress"></ha-dialog>
      </ha-card>
    `;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this._config && ev.detail.action) {
      handleAction(this, this.hass, this._config, ev.detail.action);
    }
  }

  private _showWarning(warning: string): TemplateResult {
    return html`
      <hui-warning>${warning}</hui-warning>
    `;
  }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this._config,
    });

    return html`
      ${errorCard}
    `;
  }

  // https://lit-element.polymer-project.org/guide/styles
  static get styles(): CSSResult {
    return css``;
  }
}

