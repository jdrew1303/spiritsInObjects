'use strict';

/** class representing video features */
class Video {
    public element : HTMLVideoElement = document.getElementById('video') as HTMLVideoElement;
    public canvas : HTMLCanvasElement = document.getElementById('canvas') as HTMLCanvasElement;
    public playButton : HTMLButtonElement = document.getElementById('play') as HTMLButtonElement;
    public prev : HTMLButtonElement = document.getElementById('prevFrame') as HTMLButtonElement;
    public next : HTMLButtonElement = document.getElementById('nextFrame') as HTMLButtonElement;
    public current : HTMLButtonElement = document.getElementById('currentFrame') as HTMLInputElement;

    private framesDisplay : HTMLSpanElement = document.getElementById('frames') as HTMLSpanElement;
    private fpsDisplay : HTMLSpanElement = document.getElementById('fps') as HTMLSpanElement;
    private resolutionDisplay : HTMLSpanElement = document.getElementById('resolution') as HTMLSpanElement;
    private samplerateDisplay : HTMLSpanElement = document.getElementById('samplerate') as HTMLSpanElement;
    private selectionDisplay : HTMLSpanElement = document.getElementById('selectedarea') as HTMLSpanElement;

    private ctx : CanvasRenderingContext2D = this.canvas.getContext('2d');
    private source : HTMLSourceElement;

    public width : number;
    public height : number;
    public framerate : number = 24;
    public frames : number = 0;
    public samplerate : number = 48000;
    public displayName : string;

    private interval : any = null;
    private playing : boolean = false;
    private streaming : boolean = false;

    private state : State;
    private ui : any;

    /**
     * @constructor
     * Create Video class, initialize UI elements and bind listeners
     * 
     * @param {Object} state State class
     * @param {Object} ui UI class
     */
    constructor (state : State, ui : any) {
        this.state = state;
        this.ui = ui;

        this.element.setAttribute('playsinline', 'true');
        this.element.setAttribute('webkit-playsinline', 'true');
        this.element.setAttribute('muted', 'true');
        this.element.muted = true;
        
        this.playButton.addEventListener('click', this.playButtonOnClick.bind(this), false);
        this.next.addEventListener('click', this.nextFrame.bind(this));
        this.prev.addEventListener('click', this.prevFrame.bind(this));
        this.current.addEventListener('change', this.editFrame.bind(this));

        this.ui.onSelectionChange = this.displayInfo.bind(this);

        this.restoreState();
    }

    /**
     * Restore the apps saved state to the video UI
     */
    private restoreState () {
        let files : string[] = this.state.get('files');
        if (files && files.length > 0) {
            this.framerate = this.state.get('framerate');
            this.frames = this.state.get('frames');
            this.width = this.state.get('width');
            this.height = this.state.get('height');
            this.samplerate = this.state.get('samplerate');

            this.ui.updateSliders(this.width, this.height);
            this.displayInfo();
            this.file(files[0]);
        }
    }

    /**
     * Attach stream to video element and Canvas
     * 
     * @param {Object} stream MediaStream from camera/live source
     */
    public stream (stream : MediaStream) {
        this.element.srcObject = stream;
        //this.element.load();
    }

    /**
     * 
     * 
     * @param {string} filePath Path to video file
     */
    public file (filePath : string) {
        this.source = document.createElement('source');
        this.source.setAttribute('src', filePath);
        this.element.innerHTML = '';
        this.element.appendChild(this.source);
        this.element.load();
        this.element.addEventListener('loadeddata', this.onloadstart.bind(this));
        this.current.value = '0';
    }

    private onloadstart () {
        this.width = this.element.videoWidth;
        this.height = this.element.videoHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.ui.updateSliders(this.width, this.height);
        setTimeout(this.draw.bind(this), 100);
        this.element.removeEventListener('loadeddata', this.onloadstart.bind(this));
        document.getElementById('play').removeAttribute('disabled');
        document.getElementById('sonifyFrame').removeAttribute('disabled');
        document.getElementById('sonifyVideo').removeAttribute('disabled');
    }

    private parseFps (line : string) {
        let fps : number;
        const parts = line.split('/');
        if (parts.length > 1) {
            fps = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
            fps = parseFloat(parts[0]);
        }
        return fps;
    }

    public oninfo (evt : Event, args : any) {
        let fpsRaw : string;
        let videoStream : any;
        let secondsRaw : string;

        videoStream = args.streams.find((stream : any) => {
            if (stream.codec_type === 'video') {
                return stream;
            }
            return false;
        });
      
        fpsRaw = videoStream.r_frame_rate;
        secondsRaw = videoStream.duration;

        this.framerate = this.parseFps(fpsRaw);
        this.frames = Math.floor(this.framerate * parseFloat(secondsRaw));
        this.width = videoStream.width;
        this.height = videoStream.height;
        this.samplerate = this.height * 24;

        this.state.set('framerate', this.framerate);
        this.state.set('frames', this.frames);
        this.state.set('width', this.width);
        this.state.set('height', this.height);
        this.state.set('samplerate', this.samplerate);
        this.state.save();
        this.displayInfo();

        (document.getElementById('sonifyFrame') as HTMLButtonElement).disabled  = false;
    }

    private displayInfo () {
        const start : number = this.state.get('start');
        const end : number = this.state.get('end');
        const selection : number = Math.round((end - start) * this.width);
        this.framesDisplay.innerHTML = String(this.frames);
        this.fpsDisplay.innerHTML =  String(Math.round(this.framerate * 100) / 100);
        this.resolutionDisplay.innerHTML = `${this.width}x${this.height} px`;
        this.samplerateDisplay.innerHTML = `${this.samplerate} hz`;
        this.selectionDisplay.innerHTML = `${selection} px`;
    }

    public draw () {
        this.ctx.drawImage(this.element, 0, 0, this.width, this.height);
    }

    public play () {
        let frame : number;
        if (!this.playing) {
            this.element.play();
            this.interval = setInterval(this.draw.bind(this), Math.round(1000 / this.framerate));
            this.playing = true;
            this.playButton.innerHTML = 'Pause Muted';
        } else {
            clearInterval(this.interval);
            this.interval = null;
            this.element.pause();
            this.playing = false;
            this.playButton.innerHTML = 'Play Muted';
        }
        frame = this.currentFrame();
        this.current.value = String(frame);
    }

    private playButtonOnClick (evt : MouseEvent) {
        this.play();
    }

    public set (pathStr : string) {
        const displayName : string = pathStr.split('/').pop();
        console.log(`Selected file ${displayName}`);
            
        this.file(pathStr);
        this.displayName = displayName;

        return displayName;
    }

    public currentFrame () {
        const seconds : number = this.element.currentTime;
        return Math.round(seconds * this.framerate);
    }

    public setFrame (frame : number) {
        const seconds : number = frame / this.framerate;
        this.element.currentTime = seconds;
        this.current.value = String(frame);
        setTimeout(this.draw.bind(this), 100);
    }

    public nextFrame () {
        let frame : number = this.currentFrame();
        frame++;
        if (frame > this.frames) {
            frame = this.frames;
        }
        this.setFrame(frame);
    }
    public prevFrame () {
        let frame : number = this.currentFrame();
        frame--;
        if (frame < 0) {
            frame = 0;
        }
        this.setFrame(frame);
    }
    public editFrame () {
        let frame : number = parseInt(this.current.value);
        if (frame < 0) {
            frame = 0;
        }
        if (frame > this.frames - 1) {
            frame = this.frames - 1;
        }
        this.setFrame(frame);
    }
}