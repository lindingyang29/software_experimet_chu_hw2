const {ccclass, property} = cc._decorator;

@ccclass
export default class menu extends cc.Component {
    loadGameScene() {
        cc.director.loadScene("main");
    }
}
