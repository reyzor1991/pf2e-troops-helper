const moduleName = "pf2e-troops-helper";

async function formUp() {
    console.log('Under dev');
}

Hooks.once("init", () => {
    game.pf2etroopshelper = mergeObject(game.pf2etroopshelper ?? {}, {
        "formUp": formUp,
    });
});