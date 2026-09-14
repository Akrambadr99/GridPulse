import { validateAuthorization as validate0 } from '../reserve-dispatch/policy'
import { validateAuthorization as validate1 } from '../renewable-curtailment/policy'
import { validateAuthorization as validate2 } from '../switching-order/policy'
import { validateAuthorization as validate3 } from '../outage-window/policy'
import { validateAuthorization as validate4 } from '../protection-setting/policy'
import { validateAuthorization as validate5 } from '../crew-clearance/policy'
import { validateAuthorization as validate6 } from '../telemetry-quality/policy'
import { validateAuthorization as validate7 } from '../feeder-restoration/policy'
import type { Entity, Field, Operation, Product } from '../workspace/types'
import { entity, number, requireThat, text } from '../workspace/values'
const roles=["Grid Dispatcher","Protection Engineer","Field Switching Lead","Reliability Manager"] as const
const textField=(key:string,label:string):Field=>({key,label,type:'text',required:true,initial:'Evidence pending'})
const numberField=(key:string,label:string,initial:number):Field=>({key,label,type:'number',required:true,integer:true,min:0,max:1000000000,initial})
const dateField=(key:string,label:string):Field=>({key,label,type:'date',required:true,initial:'2026-09-14'})
type Validator=(record:{measured:number;limit:number;evidence:string;revision:number})=>unknown
function workflowOperations(kind:string,label:string,validate:Validator):Operation[]{return[
  {key:kind+'-submit',label:'Submit '+label,kind,from:['draft'],roles:[roles[0]],run:({entity})=>{entity.status='review';return label+' submitted for independent review.'}},
  {key:kind+'-authorize',label:'Authorize '+label,kind,from:['review'],roles:[roles[1]],run:({entity})=>{validate({measured:number(entity.fields,'measured'),limit:number(entity.fields,'limit'),evidence:text(entity.fields,'evidence'),revision:entity.revision});entity.status='authorized';return label+' authorized against current evidence and limits.'}},
  {key:kind+'-execute',label:'Execute '+label,kind,from:['authorized'],roles:[roles[2]],run:({entity,now})=>{requireThat(text(entity.fields,'effectiveDate')<=now.slice(0,10),'The effective date has not arrived.');entity.status='active';return label+' executed with operational custody recorded.'}},
  {key:kind+'-block',label:'Block '+label,kind,from:['authorized','active'],roles:[roles[0],roles[2]],fields:[textField('reason','Blocking reason')],run:({entity,input})=>{requireThat(text(input,'reason').trim().length>=8,'A specific blocking reason is required.');entity.status='blocked';return label+' blocked without losing prior evidence.'}},
  {key:kind+'-recover',label:'Recover '+label,kind,from:['blocked'],roles:[roles[1]],fields:[textField('recovery','Recovery evidence')],run:({entity,input})=>{requireThat(text(input,'recovery').trim().length>=8,'Recovery evidence is required.');entity.status='review';return label+' returned to review with recovery evidence.'}},
  {key:kind+'-close',label:'Close '+label,kind,from:['active'],roles:[roles[3]],run:({entity})=>{entity.status='closed';return label+' closed by accountable authority.'}},
]}
const kinds=[{
    key:"reserve-dispatch", label:"Operating reserve dispatch", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Available reserve MW",6), numberField('limit',"Minimum reserve MW",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"renewable-curtailment", label:"Renewable curtailment", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Forecast imbalance MW",4), numberField('limit',"Maximum tolerated imbalance MW",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"switching-order", label:"Switching order execution", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Completed switching step",6), numberField('limit',"Required switching step",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"outage-window", label:"Planned outage windows", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Restoration hour",4), numberField('limit',"Required restoration hour",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"protection-setting", label:"Protection setting governance", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Relay setting revision",6), numberField('limit',"Approved setting revision",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"crew-clearance", label:"Field crew clearance", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Clearance score",4), numberField('limit',"Minimum clearance score",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"telemetry-quality", label:"Telemetry freshness", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Telemetry age (seconds)",6), numberField('limit',"Maximum telemetry age",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"feeder-restoration", label:"Feeder restoration capacity", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Restoration load MW",4), numberField('limit',"Available feeder MW",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  }]
const operations:Operation[]=[...workflowOperations("reserve-dispatch", "Operating reserve dispatch", validate0),
...workflowOperations("renewable-curtailment", "Renewable curtailment", validate1),
...workflowOperations("switching-order", "Switching order execution", validate2),
...workflowOperations("outage-window", "Planned outage windows", validate3),
...workflowOperations("protection-setting", "Protection setting governance", validate4),
...workflowOperations("crew-clearance", "Field crew clearance", validate5),
...workflowOperations("telemetry-quality", "Telemetry freshness", validate6),
...workflowOperations("feeder-restoration", "Feeder restoration capacity", validate7)]
const seed:Entity[]=[entity("reserve-dispatch-001","reserve-dispatch","Operating reserve dispatch primary record",'review',{owner:"Grid Dispatcher",measured:8,limit:5,evidence:"EV-GRIDPULSE-001",effectiveDate:'2026-09-14'}),
entity("reserve-dispatch-002","reserve-dispatch","Operating reserve dispatch recovery record",'blocked',{owner:"Field Switching Lead",measured:8,limit:5,evidence:"REC-GRIDPULSE-001",effectiveDate:'2026-09-15'}),
entity("renewable-curtailment-001","renewable-curtailment","Renewable curtailment primary record",'review',{owner:"Grid Dispatcher",measured:4,limit:8,evidence:"EV-GRIDPULSE-002",effectiveDate:'2026-09-14'}),
entity("renewable-curtailment-002","renewable-curtailment","Renewable curtailment recovery record",'blocked',{owner:"Field Switching Lead",measured:4,limit:8,evidence:"REC-GRIDPULSE-002",effectiveDate:'2026-09-15'}),
entity("switching-order-001","switching-order","Switching order execution primary record",'review',{owner:"Grid Dispatcher",measured:8,limit:5,evidence:"EV-GRIDPULSE-003",effectiveDate:'2026-09-14'}),
entity("switching-order-002","switching-order","Switching order execution recovery record",'blocked',{owner:"Field Switching Lead",measured:8,limit:5,evidence:"REC-GRIDPULSE-003",effectiveDate:'2026-09-15'}),
entity("outage-window-001","outage-window","Planned outage windows primary record",'review',{owner:"Grid Dispatcher",measured:4,limit:8,evidence:"EV-GRIDPULSE-004",effectiveDate:'2026-09-14'}),
entity("outage-window-002","outage-window","Planned outage windows recovery record",'blocked',{owner:"Field Switching Lead",measured:4,limit:8,evidence:"REC-GRIDPULSE-004",effectiveDate:'2026-09-15'}),
entity("protection-setting-001","protection-setting","Protection setting governance primary record",'review',{owner:"Grid Dispatcher",measured:5,limit:5,evidence:"EV-GRIDPULSE-005",effectiveDate:'2026-09-14'}),
entity("protection-setting-002","protection-setting","Protection setting governance recovery record",'blocked',{owner:"Field Switching Lead",measured:5,limit:5,evidence:"REC-GRIDPULSE-005",effectiveDate:'2026-09-15'}),
entity("crew-clearance-001","crew-clearance","Field crew clearance primary record",'review',{owner:"Grid Dispatcher",measured:8,limit:5,evidence:"EV-GRIDPULSE-006",effectiveDate:'2026-09-14'}),
entity("crew-clearance-002","crew-clearance","Field crew clearance recovery record",'blocked',{owner:"Field Switching Lead",measured:8,limit:5,evidence:"REC-GRIDPULSE-006",effectiveDate:'2026-09-15'}),
entity("telemetry-quality-001","telemetry-quality","Telemetry freshness primary record",'review',{owner:"Grid Dispatcher",measured:4,limit:8,evidence:"EV-GRIDPULSE-007",effectiveDate:'2026-09-14'}),
entity("telemetry-quality-002","telemetry-quality","Telemetry freshness recovery record",'blocked',{owner:"Field Switching Lead",measured:4,limit:8,evidence:"REC-GRIDPULSE-007",effectiveDate:'2026-09-15'}),
entity("feeder-restoration-001","feeder-restoration","Feeder restoration capacity primary record",'review',{owner:"Grid Dispatcher",measured:4,limit:8,evidence:"EV-GRIDPULSE-008",effectiveDate:'2026-09-14'}),
entity("feeder-restoration-002","feeder-restoration","Feeder restoration capacity recovery record",'blocked',{owner:"Field Switching Lead",measured:4,limit:8,evidence:"REC-GRIDPULSE-008",effectiveDate:'2026-09-15'})]
export const product:Product={name:"GridPulse",description:"Electrical grid and renewable-energy operations",accent:"#087F5B",actors:roles.map((role,index)=>({id:'actor-'+String(index),name:role,role})),kinds,operations,seed,
 validate:(entities)=>{for(const row of entities){requireThat(kinds.some(kind=>kind.key===row.kind),'Unknown domain record.');requireThat(typeof row.fields['owner']==='string','Every workflow requires accountable ownership.')}},
 metrics:(entities)=>[{label:'Domain records',value:String(entities.length)},{label:'Active controls',value:String(entities.filter(row=>['review','authorized','active','blocked'].includes(row.status)).length)},{label:'Blocked',value:String(entities.filter(row=>row.status==='blocked').length)},{label:'Closed',value:String(entities.filter(row=>row.status==='closed').length)}]}
