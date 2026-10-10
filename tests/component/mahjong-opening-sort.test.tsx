// @vitest-environment jsdom
import {render,cleanup,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useOpeningSort,openingSortDuration,rackLayoutX} from '@/components/mahjong/use-opening-sort';
function Rack({age,scope='hand',connected=true}:{age:number|null;scope?:string;connected?:boolean}){
 const ref=useOpeningSort(age,scope,connected);
 const order=age!==null&&age<1200?['c','b','a']:['a','b','c'];
 return <div ref={ref}>{order.map(id=><button key={id} data-hand-instance-id={id}>{id}</button>)}</div>;
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup(){
 vi.spyOn(HTMLElement.prototype,'offsetLeft','get').mockImplementation(function(this:HTMLElement){return [...this.parentElement!.children].indexOf(this)*42;});
 const cancel=vi.fn(),animate=vi.fn(()=>({cancel,finished:new Promise(()=>{})}));
 vi.stubGlobal('matchMedia',()=>new EventTarget());
 Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animate});
 return {cancel,animate};
}
it('moves stable physical nodes linearly at 40 ms per local slot',()=>{
 const {animate}=setup(),t=render(<Rack age={0}/>),nodes=[...t.container.querySelectorAll('button')];
 t.rerender(<Rack age={900}/>);expect(animate).not.toHaveBeenCalled();
 t.rerender(<Rack age={1200}/>);expect(animate).toHaveBeenCalledTimes(2);
 expect(animate.mock.calls).toEqual([
  [[{translate:'84px 0px'},{translate:'0px 0px'}],{duration:80,easing:'linear'}],
  [[{translate:'-84px 0px'},{translate:'0px 0px'}],{duration:80,easing:'linear'}]
 ]);
 expect([...t.container.querySelectorAll('button')].every(n=>nodes.includes(n))).toBe(true);
 t.rerender(<Rack age={1200}/>);expect(animate).toHaveBeenCalledTimes(2);
 t.rerender(<Rack age={null}/>);expect(animate).toHaveBeenCalledTimes(2);
});
for(const reason of ['pointer','resize','hidden','scope','disconnect','unmount'] as const)it('cancels sorting on '+reason,()=>{
 const {cancel}=setup(),t=render(<Rack age={900}/>);t.rerender(<Rack age={1200}/>);
 if(reason==='pointer')fireEvent.pointerDown(t.container.querySelector('button')!);
 else if(reason==='resize')fireEvent(window,new Event('resize'));
 else if(reason==='hidden')fireEvent(document,new Event('visibilitychange'));
 else if(reason==='scope')t.rerender(<Rack age={1200} scope="other"/>);
 else if(reason==='disconnect')t.rerender(<Rack age={1200} connected={false}/>);
 else t.unmount();
 expect(cancel).toHaveBeenCalledTimes(2);
});
it('never animates an initial baseline or canceled opening',()=>{
 const {animate}=setup(),t=render(<Rack age={null}/>);t.rerender(<Rack age={900}/>);
 fireEvent(window,new Event('resize'));t.rerender(<Rack age={1200}/>);expect(animate).not.toHaveBeenCalled();
});
it('scales distance by local pitch without viewport or frame-rate dependence',()=>{
 expect(openingSortDuration(84,42)).toBe(80);expect(openingSortDuration(-168,84)).toBe(80);expect(openingSortDuration(0,42)).toBe(0);expect(openingSortDuration(84,0)).toBe(0);
});

it('sums nested slot layout offsets without using transformed screen coordinates',()=>{
 const rack=document.createElement('div'),slot=document.createElement('span'),tile=document.createElement('button');rack.append(slot);slot.append(tile);
 for(const [node,left,parent] of [[rack,120,null],[slot,84,rack],[tile,3,slot]] as const)Object.defineProperties(node,{offsetLeft:{value:left},offsetParent:{value:parent}});
 expect(rackLayoutX(tile)).toBe(207);
});
