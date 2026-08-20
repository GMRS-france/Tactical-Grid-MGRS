let map = null;
let userMarker = null;
let circle = null;
let cheminementPoints = []; 
let polylineRoute = null; 
let searchMarker = null;
let isNightMode = false;
let favoris = JSON.parse(localStorage.getItem('tactical_favs') || '[]');

async function getAltitude(lat, lng) {
    try {
        const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
        const data = await response.json();
        if (data && data.results && data.results.length > 0) return data.results[0].elevation;
    } catch (e) {}
    return 0;
}

function calculerCaps(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    let brng = toDeg(Math.atan2(y, x));
    let azimutDeg = Math.round((brng + 360) % 360);
    let azimutMil = Math.round((azimutDeg * 6400) / 360);
    if (azimutMil >= 6400) azimutMil = 0;
    return { deg: azimutDeg, mil: azimutMil };
}

function initialiserCarte() {
    if (!navigator.geolocation) {
        alert("La géolocalisation n'est pas supportée.");
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        let mgrsCoord = "Hors zone MGRS";
        try {
            mgrsCoord = mgrs.forward([lng, lat], 5);
        } catch (e) {
            mgrsCoord = `Lat:${lat.toFixed(4)} Lon:${lng.toFixed(4)}`;
        }

        if (!map) {
            map = L.map('map').setView([lat, lng], 17);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: 'Map data © OpenStreetMap'
            }).addTo(map);

            map.on('click', async function(e) {
                const clickLat = e.latlng.lat;
                const clickLng = e.latlng.lng;
                let clickMgrs = "";
                try {
                    clickMgrs = mgrs.forward([clickLng, clickLat], 5);
                } catch (err) {
                    clickMgrs = "Coordonnée complexe";
                }

                document.getElementById('status').innerHTML = `⏳ <i>Calcul altitude jalon...</i>`;
                const alt = await getAltitude(clickLat, clickLng);
                const marker = L.marker([clickLat, clickLng]).addTo(map);
                cheminementPoints.push({ lat: clickLat, lng: clickLng, alt: alt, mgrs: clickMgrs, marker: marker });
                mettreAJourItineraire();
                marker.openPopup();
            });
        }

        if (userMarker) {
            map.removeLayer(userMarker);
            map.removeLayer(circle);
        }

        userMarker = L.marker([lat, lng]).addTo(map).bindPopup(`<b>Votre Position GPS</b><br>MGRS: ${mgrsCoord}`).openPopup();
        circle = L.circle([lat, lng], { radius: accuracy, color: isNightMode ? '#f00' : '#0f0', fillColor: isNightMode ? '#f00' : '#0f0', fillOpacity: 0.15 }).addTo(map);

        if (cheminementPoints.length === 0) {
            document.getElementById('status').innerHTML = `📍 <b>GPS OK</b><br><span style="font-size:11px;">${mgrsCoord}</span>`;
        }
    }, error => {
        document.getElementById('status').innerHTML = `⚠️ <b>Erreur GPS</b><br><span style="font-size:11px;">Vérifiez la localisation</span>`;
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function mettreAJourItineraire() {
    const latLngsArray = cheminementPoints.map(p => [p.lat, p.lng]);
    if (polylineRoute) {
        polylineRoute.setLatLngs(latLngsArray);
    } else if (latLngsArray.length > 0) {
        polylineRoute = L.polyline(latLngsArray, { color: isNightMode ? '#f00' : '#ff0', weight: 3, dashArray: '5, 5' }).addTo(map);
    }

    cheminementPoints.forEach((pt, index) => {
        const popupContent = `<b>Jalon #${index + 1}</b><br>MGRS: ${pt.mgrs}<br>Alt: ${Math.round(pt.alt)}m<br>` +
            `<button class="btn-action" onclick="copierTexte('${pt.mgrs}')">Copier MGRS</button> ` +
            `<button class="btn-action btn-save" onclick="sauvegarderPoint(${pt.lat}, ${pt.lng}, '${pt.mgrs}')">⭐ Sauvegarder</button> ` +
            `<button class="btn-action btn-del" onclick="supprimerJalon(${index})">❌ Supprimer</button>`;
        pt.marker.bindPopup(popupContent);
    });

    if (cheminementPoints.length >= 2) {
        let distanceTotale = 0, Dplus = 0, Dmoins = 0;
        for (let i = 0; i < cheminementPoints.length - 1; i++) {
            const p1 = cheminementPoints[i], p2 = cheminementPoints[i+1];
            distanceTotale += map.distance([p1.lat, p1.lng], [p2.lat, p2.lng]);
            const deltaAlt = p2.alt - p1.alt;
            if (deltaAlt > 0) Dplus += deltaAlt;
            else Dmoins += Math.abs(deltaAlt);
        }
        const dernierPt = cheminementPoints[cheminementPoints.length - 2];
        const avantDernierPt = cheminementPoints[cheminementPoints.length - 1];
        const distanceEtape = map.distance([dernierPt.lat, dernierPt.lng], [avantDernierPt.lat, avantDernierPt.lng]);
        const caps = calculerCaps(dernierPt.lat, dernierPt.lng, avantDernierPt.lat, avantDernierPt.lng);

        const KE = (distanceTotale / 1000) + (Dplus / 125) + (Dmoins / 400);
        const tempsHeures = KE / 4; 
        const heures = Math.floor(tempsHeures);
        const minutes = Math.round((tempsHeures - heures) * 60);
        const tempsStr = heures > 0 ? `${heures}h${minutes < 10 ? '0' : ''}${minutes}` : `${minutes} min`;

        let distTotStr = distanceTotale >= 1000 ? `${(distanceTotale / 1000).toFixed(2)} km` : `${Math.round(distanceTotale)} m`;
        let distEtapStr = distanceEtape >= 1000 ? `${(distanceEtape / 1000).toFixed(2)} km` : `${Math.round(distanceEtape)} m`;

        document.getElementById('status').innerHTML = `📍 <b>Parcours : ${cheminementPoints.length} jalons</b><br>` +
            `Étape : ${distEtapStr} | Cap : <b>${caps.deg}°</b> (${caps.mil} mil)<br>` +
            `Total : ${distTotStr} | 📈 D+:${Math.round(Dplus)}m 📉 D-:${Math.round(Dmoins)}m<br>` +
            `<b style="color:${isNightMode ? '#f88' : '#7ff'};">KE: ${KE.toFixed(1)} | Est. ${tempsStr}</b>`;
    } else if (cheminementPoints.length === 1) {
        document.getElementById('status').innerHTML = `📍 <b>Départ (Jalon #1)</b> - ${Math.round(cheminementPoints[0].alt)}m`;
    }
}

function supprimerJalon(index) {
    if (cheminementPoints[index]?.marker) map.removeLayer(cheminementPoints[index].marker);
    cheminementPoints.splice(index, 1);
    if (cheminementPoints.length === 0 && polylineRoute) {
        map.removeLayer(polylineRoute);
        polylineRoute = null;
    }
    mettreAJourItineraire();
}

function effacerItineraire() {
    cheminementPoints.forEach(p => { if (p.marker) map.removeLayer(p.marker); });
    cheminementPoints = [];
    if (polylineRoute) { map.removeLayer(polylineRoute); polylineRoute = null; }
    document.getElementById('status').innerHTML = `🗑️ <b>Itinéraire effacé</b>`;
}

function sauvegarderPoint(lat, lng, mgrsCode) {
    const nom = prompt("Nom de ce point (ex: Balise 1, PC...):", "Point " + (favoris.length + 1));
    if (!nom) return;
    favoris.push({ nom, lat, lng, mgrs: mgrsCode });
    localStorage.setItem('tactical_favs', JSON.stringify(favoris));
    mettreAJourAffichageFavoris();
    alert("Point sauvegardé !");
}

function mettreAJourAffichageFavoris() {
    const listeDiv = document.getElementById('favorites-list');
    if (favoris.length === 0) { listeDiv.innerHTML = "Aucun point"; return; }
    let html = "";
    favoris.forEach((pt, index) => {
        html += `<div class="fav-item"><span onclick="map.setView([${pt.lat}, ${pt.lng}], 18)"><b>${pt.nom}</b><br>${pt.mgrs}</span><button onclick="supprimerFavoris(${index})">×</button></div>`;
    });
    listeDiv.innerHTML = html;
}

function supprimerFavoris(index) {
    favoris.splice(index, 1);
    localStorage.setItem('tactical_favs', JSON.stringify(favoris));
    mettreAJourAffichageFavoris();
}

function basculerPanneauFavoris() {
    const panel = document.getElementById('favorites-panel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    mettreAJourAffichageFavoris();
}

function basculerModalAide() {
    const modal = document.getElementById('help-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function basculerModeNuit() {
    isNightMode = !isNightMode;
    document.body.classList.toggle('night-mode', isNightMode);
    document.getElementById('btn-night').innerText = isNightMode ? "☀️" : "🌙";
    if (polylineRoute) polylineRoute.setStyle({ color: isNightMode ? '#f00' : '#ff0' });
}

function rechercherMGRS() {
    const inputVal = document.getElementById('search-input').value.trim();
    if (!inputVal) return alert("Entrez un code MGRS.");
    try {
        const latLon = mgrs.inverse(inputVal);
        map.setView([latLon[1], latLon[0]], 17);
        if (searchMarker) map.removeLayer(searchMarker);
        searchMarker = L.marker([latLon[1], latLon[0]]).addTo(map)
            .bindPopup(`<b>Objectif</b><br>MGRS: ${inputVal.toUpperCase()}<br><button class="btn-action btn-save" onclick="sauvegarderPoint(${latLon[1]}, ${latLon[0]}, '${inputVal.toUpperCase()}')">⭐ Sauvegarder</button>`)
            .openPopup();
        document.getElementById('status').innerHTML = `🔍 <b>Trouvé :</b> ${inputVal.toUpperCase()}`;
    } catch (err) {
        alert("Code MGRS invalide !");
    }
}

function centrerSurGPS() {
    navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 17);
    });
}

function copierTexte(texte) {
    navigator.clipboard.writeText(texte).then(() => alert("Copié : " + texte));
}

window.onload = function() {
    initialiserCarte();
    mettreAJourAffichageFavoris();
};
