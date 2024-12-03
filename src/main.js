const moduleName = "pf2e-troops-helper";

function translate(value) {
    return game.i18n.localize(`${moduleName}.${value}`)
}

function translateFormat(value, data) {
    return game.i18n.format(`${moduleName}.${value}`, data)
}

function getAllCoordinates(x, y, width) {
    const size = canvas.dimensions.size;

    const startY = y;
    const arr = [];

    for (let i = 0; i < width; i++) {
        for (let j = 0; j < width; j++) {
            arr.push({x, y});
            y += size;
        }
        y = startY;
        x += size;
    }
    return arr
}

const newCoords = [
    {x: -1, y: 0},
    {x: -2, y: 0},
    {x: -3, y: 0},
    {x: 1, y: 0},
    {x: 2, y: 0},
    {x: 3, y: 0},

    {x: -1, y: 1},
    {x: -2, y: 1},
    {x: -3, y: 1},
    {x: 0, y: 1},
    {x: 1, y: 1},
    {x: 2, y: 1},
    {x: 3, y: 1},
    {x: -1, y: -1},
    {x: -2, y: -1},
    {x: -3, y: -1},
    {x: 0, y: -1},
    {x: 1, y: -1},
    {x: 2, y: -1},
    {x: 3, y: -1},

    {x: -1, y: 2},
    {x: -2, y: 2},
    {x: 0, y: 2},
    {x: 1, y: 2},
    {x: 2, y: 2},
    {x: -1, y: -2},
    {x: -2, y: -2},
    {x: 0, y: -2},
    {x: 1, y: -2},
    {x: 2, y: -2},

    {x: -1, y: 3},
    {x: 0, y: 3},
    {x: 1, y: 3},
    {x: -1, y: -3},
    {x: 0, y: -3},
    {x: 1, y: -3},
]

async function formUp(token) {
    if (!game.user.isGM) {
        ui.notifications.warn(translate("onlyGM"));
        return
    }
    if (!token) {
        ui.notifications.warn(translate("selectFormUp"));
        return;
    }
    let canvasDistance = canvas.dimensions?.size ?? 100
    const tokensForUpdate = token.actor.getActiveTokens().filter(t => t !== token);
    const occupied = token.scene.tokens
        .filter(t => !tokensForUpdate.includes(t.object) && t.object !== token)
        .map(t => getAllCoordinates(t.x, t.y, t.width)).flat()
        .map(a => JSON.stringify(a));

    let newPossibleLocations = foundry.utils.deepClone(newCoords).map(c => {
        return {
            x: token.x + c.x * canvasDistance,
            cx: token.center.x + c.x * canvasDistance,
            y: token.y + c.y * canvasDistance,
            cy: token.center.y + c.y * canvasDistance
        }
    });

    let availableLocations = newPossibleLocations.filter(coo => {
        return !CONFIG.Canvas.polygonBackends.move.testCollision(token.center, {x: coo.cx, y: coo.cy}, {
            type: 'move',
            mode: 'any'
        })
    }).filter(target => {
        return !occupied.includes(JSON.stringify({x: target.x, y: target.y}));
    });

    for (let i = 0; i < tokensForUpdate.length; i++) {
        if (!availableLocations.length) {
            continue
        }
        let ttt = tokensForUpdate[i];
        let nn = availableLocations.shift();
        await ttt.document.update({x: nn.x, y: nn.y})
    }
    ui.notifications.info(translate("formedUp"));
}

async function createTroop(token, count = 16) {
    if (!game.user.isGM) {
        ui.notifications.warn(translate("onlyGM"));
        return
    }
    if (!token) {
        ui.notifications.warn(translate("selectCreate"));
        return;
    }
    if (!token.actor) {
        ui.notifications.warn(translate("noActor"));
        return;
    }
    if (!count || count < 0 || count > 16) {
        ui.notifications.warn(translate("copy16"));
        return;
    }

    let canvasDistance = token?.scene?.grid?.size ?? 100

    const originX = token.x;
    const originY = token.y;

    const actorOrigin = await fromUuid(`Actor.${token.actor.id}`);
    const inCombat = game.combat?.turns?.find(a => a.token.id === token.id);
    if (token.scene.tokens.has(token.id)) {
        await token.scene.deleteEmbeddedDocuments("Token", [token.id]);
    }

    await actorOrigin.update({
        prototypeToken: {actorLink: true},
        system: {
            traits: {size: {value: 'med'}}
        },
        flags: {
            [moduleName]: {
                isTroop: true,
                firstStage: false,
                secondStage: false,
            }
        }
    });

    let tokens = [];
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            tokens.push(
                (await actorOrigin.getTokenDocument({
                    x: originX + x * canvasDistance,
                    y: originY + y * canvasDistance,
                })).toObject()
            )
            if (tokens.length === count) {
                break;
            }
        }
        if (tokens.length === count) {
            break;
        }
    }

    tokens = await token.scene.createEmbeddedDocuments("Token", tokens);
    tokens[0].update({
        "ring.enabled": true,
        "ring.colors.ring": "#ff0000",
        "ring.effects": 3

    })
    if (inCombat) {
        await game.combat.createEmbeddedDocuments("Combatant", [
            {
                tokenId: tokens[0].id,
                initiative: inCombat.initiative,
            },
        ])
    }
    ui.notifications.info(translate("created"));
}

async function createTroopSize(token) {
    await token.actor.update({
        flags: {
            [moduleName]: {
                isTroopSize: true,
                firstStage: false,
                secondStage: false,
            }
        }
    });

    ui.notifications.info(translate("created"));
}

Hooks.once("init", () => {
    game.settings.register(moduleName, "autoDelete", {
        scope: "world",
        config: true,
        name: `${moduleName}.SETTINGS.delete.name`,
        default: false,
        type: Boolean,
    });

    game.pf2etroopshelper = foundry.utils.mergeObject(game.pf2etroopshelper ?? {}, {
        "formUp": formUp,
        "createTroop": async function (token) {
            if (!game.user.isGM) {
                ui.notifications.warn(translate("onlyGM"));
                return
            }
            if (!token) {
                ui.notifications.warn(translate("selectCreate"));
                return;
            }
            if (!token.actor) {
                ui.notifications.warn(translate("noActor"));
                return;
            }

            const {createType} = await foundry.applications.api.DialogV2.wait({
                window: {title: translate("selectTransformation")},
                content: `
                    <select id="fob1" autofocus>
                        <option value="multi">${translate("multiTokens")}</option>
                        <option value="size">${translate("sizeChanging")}</option>
                    </select>
                `,
                buttons: [{
                    action: "ok",
                    label: translate("select"),
                    icon: "<i class='fa-solid fa-hand-fist'></i>",
                    callback: (event, button, form) => {
                        return {
                            createType: $(form).find("#fob1").val(),
                        }
                    }
                }, {
                    action: "cancel",
                    label: translate("cancel"),
                    icon: "<i class='fa-solid fa-ban'></i>",
                }],
                default: "ok"
            });
            if (!createType) {
                return
            }

            if (createType === "size") {
                await createTroopSize(token);
                return
            }

            const {count} = await Dialog.wait({
                title: translate(`FORMS.createTroop.title`),
                content: `
                    <input type="number" id="count" value="16"/>
                `,
                buttons: {
                    ok: {
                        label: translate("create"),
                        icon: '<i class="fa-thin fa-location-arrow"></i>',
                        callback: (html) => {
                            return {count: $(html).find('#count').val()}
                        }
                    },
                    cancel: {
                        label: translate("cancel"),
                        icon: "<i class='fa-solid fa-ban'></i>",
                    }
                },
                default: "ok"
            });
            if (!count) {
                return
            }
            await createTroop(token, Number(count));
        },
    });
});

Hooks.on('getSceneControlButtons', function addControl(sceneControls) {
    if (!game.user.isGM) {
        return;
    }

    const tokenControl = sceneControls.find((c) => c.name === 'token');
    tokenControl.tools.push({
        name: 'troop-army',
        title: `${moduleName}.createTroop`,
        icon: 'fas fa-people-arrows',
        button: true,
        onClick: () => createTroop(canvas.tokens.controlled[0]),
    });
});

Hooks.on('preDeleteToken', (token, _data) => {
    if (!game.combat
        || !token.actorLink
        || !token.actor?.getFlag(moduleName, "isTroop")
    ) {
        return
    }

    if (token.actor.system.attributes.hp.value > 0 && game.combat.turns.find(a => a.token.id === token.id)) {
        ui.notifications.warn(`${moduleName}.initiativeToken`);
        return false
    }
})

Hooks.on('preUpdateActor', async (actor, data, _diff, _id) => {
    if (!actor.getFlag(moduleName, "isTroop")) {
        return
    }
    if (data?.system?.attributes?.hp) {
        const perc = (data.system.attributes.hp.value / actor.system.attributes?.hp.max).toFixed(2);
        if (perc <= 0.33 && !actor.getFlag(moduleName, "secondStage")) {
            //inform about 1/3
            await actor.setFlag(moduleName, "secondStage", true);

            let value = 4;
            if (!actor.getFlag(moduleName, "firstStage")) {
                await actor.setFlag(moduleName, "firstStage", true);
                value = 8;
            }

            if (game.settings.get(moduleName, "autoDelete")) {
                let cTokens = game.combat?.turns?.map(a => a.token.id) || [];
                actor.getActiveTokens().filter(t => !cTokens.includes(t.id)).slice(0, value).forEach(t => {
                    t.document.delete()
                })

                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: translateFormat("autoDeleteTokens", {value}),
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            } else {
                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: translateFormat("needDeleteTokens", {value}),
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            }
        } else if (perc <= 0.66 && !actor.getFlag(moduleName, "firstStage")) {
            //inform about 2/3
            await actor.setFlag(moduleName, "firstStage", true);

            if (game.settings.get(moduleName, "autoDelete")) {
                let cTokens = game.combat?.turns?.map(a => a.token.id) || [];
                actor.getActiveTokens().filter(t => !cTokens.includes(t.id)).slice(0, 4).forEach(t => {
                    t.document.delete()
                })

                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: translate("autoDelete4"),
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            } else {
                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: translate("needDelete4"),
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            }
        }

    }
});

Hooks.on('preUpdateActor', async (actor, data, _diff, _id) => {
    if (!actor.getFlag(moduleName, "isTroopSize")) {
        return
    }
    if (data?.system?.attributes?.hp) {
        const perc = (data.system.attributes.hp.value / actor.system.attributes?.hp.max).toFixed(2);
        if (perc <= 0.33 && !actor.getFlag(moduleName, "secondStage")) {
            //inform about 1/3
            await actor.setFlag(moduleName, "secondStage", true);

            if (!actor.getFlag(moduleName, "firstStage")) {
                await actor.setFlag(moduleName, "firstStage", true);
            }

            await actor.update({
                "system.traits.size.value": "lg"
            })

            ChatMessage.create({
                type: CONST.CHAT_MESSAGE_TYPES.OOC,
                content: translate("sizeChanged"),
                whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
            });
        } else if (perc <= 0.66 && !actor.getFlag(moduleName, "firstStage")) {
            //inform about 2/3
            await actor.setFlag(moduleName, "firstStage", true);

            await actor.update({
                "system.traits.size.value": "huge"
            })

            ChatMessage.create({
                type: CONST.CHAT_MESSAGE_TYPES.OOC,
                content: translate("sizeChanged"),
                whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
            });
        }

    }
});