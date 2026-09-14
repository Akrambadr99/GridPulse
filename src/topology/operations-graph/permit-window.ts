export interface TimeWindowDecision{inside:boolean;earlyBy:number;lateBy:number}
export function permitWindow(value:number,opens:number,closes:number):TimeWindowDecision{if(![value,opens,closes].every(Number.isFinite)||opens>closes)throw new Error('Invalid Maintenance permits boundary.');return{inside:value>=opens&&value<=closes,earlyBy:Math.max(0,opens-value),lateBy:Math.max(0,value-closes)}}
