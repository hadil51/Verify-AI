import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
import re

VALID_COUNTRIES = {
  "ABW","AFG","AGO","AIA","ALA","ALB","AND","ARE","ARG","ARM","ASM","ATA","ATF","ATG","AUS",
  "AUT","AZE","BDI","BEL","BEN","BES","BFA","BGD","BGR","BHR","BHS","BIH","BLM","BLR","BLZ",
  "BMU","BOL","BRA","BRB","BRN","BTN","BVT","BWA","CAF","CAN","CCK","CHE","CHL","CHN","CIV",
  "CMR","COD","COG","COK","COL","COM","CPV","CRI","CUB","CUW","CXR","CYM","CYP","CZE","DEU",
  "DJI","DMA","DNK","DOM","DZA","ECU","EGY","ERI","ESH","ESP","EST","ETH","FIN","FJI","FLK",
  "FRA","FRO","FSM","GAB","GBR","GEO","GGY","GHA","GIB","GIN","GLP","GMB","GNB","GNQ","GRC",
  "GRD","GRL","GTM","GUF","GUM","GUY","HKG","HMD","HND","HRV","HTI","HUN","IDN","IMN","IND",
  "IOT","IRL","IRN","IRQ","ISL","ISR","ITA","JAM","JEY","JOR","JPN","KAZ","KEN","KGZ","KHM",
  "KIR","KNA","KOR","KWT","LAO","LBN","LBR","LBY","LCA","LIE","LKA","LSO","LTU","LUX","LVA",
  "MAC","MAF","MAR","MCO","MDA","MDG","MDV","MEX","MHL","MKD","MLI","MLT","MMR","MNE","MNG",
  "MNP","MOZ","MRT","MSR","MTQ","MUS","MWI","MYS","MYT","NAM","NCL","NER","NFK","NGA","NIC",
  "NIU","NLD","NOR","NPL","NRU","NZL","OMN","PAK","PAN","PCN","PER","PHL","PLW","PNG","POL",
  "PRI","PRK","PRT","PRY","PSE","PYF","QAT","REU","ROU","RUS","RWA","SAU","SDN","SEN","SGP",
  "SGS","SHN","SJM","SLB","SLE","SLV","SMR","SOM","SPM","SRB","SSD","STP","SUR","SVK","SVN",
  "SWE","SWZ","SXM","SYC","SYR","TCA","TCD","TGO","THA","TJK","TKL","TKM","TLS","TON","TTO",
  "TUN","TUR","TUV","TWN","TZA","UGA","UKR","UMI","URY","USA","UZB","VAT","VCT","VEN","VGB",
  "VIR","VNM","VUT","WLF","WSM","YEM","ZAF","ZMB","ZWE"
}

import re


# ─────────────────────────────────────────────
# FONCTIONS DE PARSING DATES (CORRIGÉES)
# ─────────────────────────────────────────────

def _parse_date_mrz(ymd: str) -> datetime | None:
    """Parse MRZ date format YYMMDD avec correction intelligente du siècle."""
    if not ymd or len(ymd.strip()) != 6 or not ymd.strip().isdigit():
        return None

    ymd = ymd.strip()
    yy = int(ymd[0:2])
    mm = int(ymd[2:4])
    dd = int(ymd[4:6])

    current_yy = datetime.now().year % 100
    year = 1900 + yy if yy > (current_yy + 10) else 2000 + yy

    try:
        return datetime(year, mm, dd)
    except ValueError:
        return None


def _parse_date_visual(raw: str) -> datetime | None:
    """Parse dates visuelles (DD/MM/YYYY, etc.)."""
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    if re.fullmatch(r"\d{8}", raw):
        try:
            return datetime.strptime(raw, "%Y%m%d")
        except ValueError:
            pass
    if re.fullmatch(r"\d{6}", raw):
        return _parse_date_mrz(raw)
    return None


# ─────────────────────────────────────────────
# 1. VÉRIFICATION DE COHÉRENCE AVEC LA MRZ
# ─────────────────────────────────────────────
def check_mrz_coherence(fields: dict, mrz_fields: dict) -> dict:
    """Vérifie la cohérence entre les champs visuels et la MRZ."""
    checks = {}
    details = {}

    # Nom
    visual_surname = (fields.get("surname", "") or "").strip().upper().replace("<", "").replace(" ", "")
    mrz_surname = (mrz_fields.get("surname", "") or "").strip().upper().replace("<", "").replace(" ", "")
    checks["surname_match"] = bool(visual_surname) and visual_surname == mrz_surname
    details["surname_match"] = f"Nom : {visual_surname or '—'} ↔ MRZ : {mrz_surname or '—'}"

    # Prénom
    visual_names = (fields.get("names", "") or "").strip().upper().replace("<", "").replace(" ", "")
    mrz_names = (mrz_fields.get("names", "") or "").strip().upper().replace("<", "").replace(" ", "")
    checks["names_match"] = bool(visual_names) and visual_names == mrz_names
    details["names_match"] = f"Prénom : {visual_names or '—'} ↔ MRZ : {mrz_names or '—'}"

    # Nationalité
    visual_nat = (fields.get("nationality", "") or "").strip().upper()
    mrz_nat = (mrz_fields.get("nationality", "") or "").strip().upper()
    checks["nationality_match"] = visual_nat == mrz_nat and visual_nat in VALID_COUNTRIES
    details["nationality_match"] = f"Nationalité : {visual_nat or '—'} ↔ MRZ : {mrz_nat or '—'}"

    # Pays
    visual_country = (fields.get("country", "") or "").strip().upper()
    mrz_country = (mrz_fields.get("country", "") or "").strip().upper()
    checks["country_match"] = visual_country == mrz_country and visual_country in VALID_COUNTRIES
    details["country_match"] = f"Pays : {visual_country or '—'} ↔ MRZ : {mrz_country or '—'}"

    # Date de naissance
    visual_dob = _parse_date_visual(fields.get("date_of_birth", ""))
    mrz_dob = _parse_date_mrz(mrz_fields.get("date_of_birth", ""))
    checks["dob_match"] = bool(visual_dob) and bool(mrz_dob) and visual_dob.date() == mrz_dob.date()
    details["dob_match"] = f"Date de naissance : {fields.get('date_of_birth', '—')}"

    # Date d'expiration
    visual_exp = _parse_date_visual(fields.get("expiration_date", ""))
    mrz_exp = _parse_date_mrz(mrz_fields.get("expiration_date", ""))
    checks["expiry_match"] = bool(visual_exp) and bool(mrz_exp) and visual_exp.date() == mrz_exp.date()
    details["expiry_match"] = f"Date d'expiration : {fields.get('expiration_date', '—')}"

    # Sexe
    visual_sex = (fields.get("sex", "") or "").strip().upper()
    mrz_sex = (mrz_fields.get("sex", "") or "").strip().upper()
    checks["sex_match"] = visual_sex == mrz_sex and visual_sex in ("M", "F")
    details["sex_match"] = f"Sexe : {visual_sex or '—'}"

    return {"checks": checks, "details": details}


# ─────────────────────────────────────────────
# 2. VÉRIFICATION LOGIQUE PURE DES CHAMPS
# ─────────────────────────────────────────────
def _normalize_name(text: str) -> str:
    """Nettoyage ultra-robuste pour comparaison nom/prénom."""
    if not text:
        return ""
    # 1. Uppercase
    text = text.strip().upper()
    # 2. Supprime TOUT ce qui n'est pas une lettre (y compris < > , . - / espaces etc.)
    text = re.sub(r'[^A-ZÀ-Ÿ]', '', text)
    return text


def check_logical_consistency(fields: dict, is_mrz_mode: bool = True) -> dict:
    """Vérifications logiques / métier indépendantes de la MRZ."""
    checks = {}
    details = {}
    now = datetime.now()

    # === 1. Âge réaliste ===
    dob_parser = _parse_date_mrz if is_mrz_mode else _parse_date_visual
    dob = dob_parser(fields.get("date_of_birth", ""))
    if dob:
        age = (now - dob).days / 365.25
        checks["realistic_age"] = 0 < age < 120
        details["realistic_age"] = f"Âge ≈ {int(age)} ans ({'Réaliste' if checks['realistic_age'] else 'Âge impossible'})"
    else:
        checks["realistic_age"] = False
        details["realistic_age"] = "Date de naissance invalide"

    # === 2. Naissance avant expiration ===
    exp = dob_parser(fields.get("expiration_date", ""))
    if dob and exp:
        checks["dob_before_expiry"] = dob < exp
        details["dob_before_expiry"] = "Naissance avant expiration : OK" if checks["dob_before_expiry"] else "Erreur : naissance après expiration"
    else:
        checks["dob_before_expiry"] = False
        details["dob_before_expiry"] = "Impossible de comparer les dates"

    # === 3. Cohérence Nationalité ↔ Pays ===
    country = (fields.get("country", "") or "").strip().upper()
    nationality = (fields.get("nationality", "") or "").strip().upper()
    checks["country_nationality_coherent"] = (country == nationality) or nationality in ("<<", "")
    details["country_nationality_coherent"] = f"Pays {country} / Nationalité {nationality} ({'Cohérent' if checks['country_nationality_coherent'] else 'Incohérence'})"

    # === 4. Nom et Prénom présents + différents (FIX DÉFINITIF) ===
    surname_clean = _normalize_name(fields.get("surname", ""))
    names_clean   = _normalize_name(fields.get("names", ""))

    checks["name_and_prenom_present"] = bool(surname_clean) and len(surname_clean) >= 2 and bool(names_clean) and len(names_clean) >= 2
    checks["name_different_from_prenom"] = (surname_clean != names_clean) and checks["name_and_prenom_present"]

    details["name_and_prenom_present"] = f"Nom et prénom présents : {'OK' if checks['name_and_prenom_present'] else 'Manquant'}"
    details["name_different_from_prenom"] = "Nom différent du prénom : OK" if checks["name_different_from_prenom"] else "Nom et prénom identiques (ou trop similaires)"

    # ... (le reste de la fonction reste inchangé)
    return {"checks": checks, "details": details}


# ─────────────────────────────────────────────
# CAS 1 — MRZ trouvée : vérification complète
# ─────────────────────────────────────────────

def _analyze_with_mrz(fields: dict, mrz_type: str) -> dict:
    checks = {}
    details = {}

    # 1. MRZ détectée
    checks["mrz_detected"] = True
    details["mrz_detected"] = f"MRZ type : {mrz_type}"

    # === PARTIE 1 : Cohérence avec la MRZ ===
    mrz_coherence = check_mrz_coherence(fields, fields)
    checks.update(mrz_coherence["checks"])
    details.update(mrz_coherence["details"])

    # === PARTIE 2 : Vérifications logiques ===
    logic = check_logical_consistency(fields, is_mrz_mode=True)
    checks.update(logic["checks"])
    details.update(logic["details"])

    # Calcul du score
    passed = sum(1 for v in checks.values() if v is True)
    total = len(checks)
    score = round(passed / total, 4) if total > 0 else 0.0

    return {
        "score":   score,
        "checks":  checks,
        "details": details,
        "error":   None,
        "mode":    "mrz",
    }


# ─────────────────────────────────────────────
# CAS 2 — Pas de MRZ : vérification visuelle
# ─────────────────────────────────────────────

def _analyze_without_mrz(fields: dict) -> dict:
    now = datetime.now()
    checks = {}
    details = {}

    # Information MRZ absente
    checks["mrz_detected"] = False
    details["mrz_detected"] = "Aucune MRZ détectée — analyse visuelle uniquement"

    # === PARTIE 1 : Cohérence interne des champs ===
    surname = (fields.get("surname", "") or "").strip()
    names = (fields.get("names", "") or "").strip()

    checks["name_and_prenom_present"] = bool(surname) and len(surname) >= 2 and bool(names) and len(names) >= 2
    details["name_and_prenom_present"] = f"Nom : {surname or '—'} | Prénom : {names or '—'}"

    clean_surname = surname.replace("<", "").replace(" ", "").upper()
    clean_names = names.replace("<", "").replace(" ", "").upper()
    checks["name_different_from_prenom"] = clean_surname != clean_names and bool(clean_surname) and bool(clean_names)
    details["name_different_from_prenom"] = "Nom et prénom différents : OK" if checks["name_different_from_prenom"] else "Nom et prénom identiques ou vides"

    # === PARTIE 2 : Vérifications logiques ===
    logic = check_logical_consistency(fields, is_mrz_mode=False)
    checks.update(logic["checks"])
    details.update(logic["details"])

    # Date de naissance et expiration
    dob = _parse_date_visual(fields.get("date_of_birth", ""))
    exp = _parse_date_visual(fields.get("expiration_date", ""))

    if dob:
        age = (now - dob).days / 365.25
        checks["valid_dob"] = 0 < age < 120
        details["valid_dob"] = f"Naissance : {fields.get('date_of_birth','—')} (~{int(age)} ans)"
    else:
        checks["valid_dob"] = False
        details["valid_dob"] = "Date de naissance illisible"

    if exp:
        days_diff = (exp - now).days
        checks["valid_expiry"] = days_diff > -1825
        details["valid_expiry"] = f"Expiration : {fields.get('expiration_date','—')}"
    else:
        checks["valid_expiry"] = False
        details["valid_expiry"] = "Date d'expiration illisible"

    # Numéro document
    number = fields.get("number", "").strip()
    checks["doc_number_found"] = bool(number) and len(number) >= 4
    details["doc_number_found"] = f"N° document : {number}" if checks["doc_number_found"] else "Numéro document non extrait"

    # Sexe
    sex = fields.get("sex", "").strip().upper()
    if sex:
        checks["valid_sex"] = sex in ("M", "F")
        details["valid_sex"] = f"Sexe : {sex}"
    else:
        checks["valid_sex"] = True
        details["valid_sex"] = "Sexe non détecté"

    # Calcul du score pondéré
    WEIGHTS = {
        "mrz_detected":                 0.0,
        "name_and_prenom_present":      0.18,
        "name_different_from_prenom":   0.12,
        "realistic_age":                0.20,
        "dob_before_expiry":            0.15,
        "country_nationality_coherent": 0.15,
        "valid_dob":                    0.08,
        "valid_expiry":                 0.05,
        "doc_number_found":             0.04,
        "valid_sex":                    0.03,
    }

    weighted_score = 0.0
    total_weight = 0.0
    for key, w in WEIGHTS.items():
        if key in checks and w > 0:
            total_weight += w
            weighted_score += w * (1.0 if checks[key] else 0.0)

    score = round(weighted_score / total_weight, 4) if total_weight > 0 else 0.5
    score = round(min(score, 0.85), 4)

    return {
        "score":   score,
        "checks":  checks,
        "details": details,
        "error":   None,
        "mode":    "visual",
        "note":    "Vérification visuelle — MRZ absente",
    }


# ─────────────────────────────────────────────
# POINT D'ENTRÉE PRINCIPAL
# ─────────────────────────────────────────────

def analyze(ocr_result: dict) -> dict:
    """
    Point d'entrée principal.
    """
    mrz_found = ocr_result.get("mrz_found", True)
    fields    = ocr_result.get("fields", {})
    mrz_type  = ocr_result.get("mrz_type", "")

    if mrz_found and mrz_type not in ("", "None", "Unknown"):
        return _analyze_with_mrz(fields, mrz_type)
    else:
        return _analyze_without_mrz(fields)