"""Template definitions for visual field extraction."""

ID_TEMPLATES = {
    "ALB": {
        "detect_keywords": ["SHQIPËRISË", "ALBANIA", "LETËRNJOFTIM"],
        "field_labels": {
            "surname": "Surname",
            "names": "Given Name",
            "nationality": "Nationality",
            "number": "Card No.",
            "date_of_birth": "Date of Birth",
            "sex": "Sex",
            "expiration_date": "Date of Expiry",
        },
        "photo": {
            # Large portrait on the left side
            "coords": (0.01, 0.10, 0.30, 0.88),
        },
        "fields": {
            # Surname
            "surname": (0.31, 0.17, 0.72, 0.28),
            # Given names
            "names": (0.31, 0.28, 0.68, 0.38),
            # Nationality
            "nationality": (0.31, 0.38, 0.74, 0.49),
            # Card number
            "number": (0.63, 0.38, 0.97, 0.49),
            # Date of birth
            "date_of_birth": (0.31, 0.52, 0.63, 0.63),
            # Sex
            "sex": (0.63, 0.52, 0.82, 0.63),
            # Expiration date
            "expiration_date": (0.63, 0.63, 0.97, 0.74),
        },
    },
    "ESP": {
        "detect_keywords": ["ESPAÑA", "IDENTIDAD", "DNI"],
        "field_labels": {
            "surname": "Apellido",
            "names": "Nombre",
            "nationality": "Nacionalidad",
            "number": "IDESP",
            "date_of_birth": "Fecha de Nacimiento",
            "sex": "Sexo",
            "expiration_date": "Válido Hasta",
        },
        "photo": {
            # Large portrait on the right side
            "coords": (0.67, 0.22, 0.99, 0.95),
        },
        "fields": {
            # Primer apellido
            "surname": (0.30, 0.13, 0.66, 0.24),
            # Nombre (skip segundo apellido)
            "names": (0.30, 0.30, 0.66, 0.41),
            # Nacionalidad
            "nationality": (0.42, 0.42, 0.65, 0.52),
            # Sexo
            "sex": (0.30, 0.42, 0.42, 0.52),
            # Fecha de nacimiento
            "date_of_birth": (0.30, 0.52, 0.66, 0.63),
            # IDESP
            "number": (0.30, 0.63, 0.66, 0.73),
            # Válido hasta
            "expiration_date": (0.30, 0.73, 0.66, 0.83),
        },
    },
    "EST": {
        "detect_keywords": ["EESTI", "VABARIIK", "ESTONIA"],
        "field_labels": {
            "surname": "Surname",
            "names": "Given Names",
            "nationality": "Citizenship",
            "number": "Document Number",
            "date_of_birth": "Date of Birth",
            "sex": "Sex",
            "expiration_date": "Date of Expiry",
        },
        "photo": {
            # Large portrait on the left side
            "coords": (0.01, 0.12, 0.35, 0.80),
        },
        "fields": {
            # Surname
            "surname": (0.36, 0.18, 0.78, 0.30),
            # Given names
            "names": (0.36, 0.30, 0.78, 0.42),
            # Sex
            "sex": (0.36, 0.48, 0.55, 0.56),
            # Citizenship
            "nationality": (0.36, 0.56, 0.62, 0.64),
            # Date of birth
            "date_of_birth": (0.36, 0.64, 0.78, 0.72),
            # Document number
            "number": (0.36, 0.78, 0.78, 0.87),
            # Expiration date
            "expiration_date": (0.36, 0.87, 0.78, 0.96),
        },
    },
    "FIN": {
        "detect_keywords": ["SUOMI", "FINLAND", "HENKILÖKORTTI"],
        "field_labels": {
            "surname": "Sukunimi / Surname",
            "names": "Etunimet / Given Names",
            "nationality": "Kansalaisuus",
            "number": "Korttinumero",
            "date_of_birth": "Syntymäaika",
            "sex": "Sukupuoli",
            "expiration_date": "Viim. voimassaolopäivä",
        },
        "photo": {
            # Large portrait on the right side
            "coords": (0.62, 0.15, 0.99, 0.95),
        },
        "fields": {
            # Surname
            "surname": (0.30, 0.15, 0.62, 0.26),
            # Given names
            "names": (0.30, 0.26, 0.62, 0.37),
            # Sex
            "sex": (0.30, 0.37, 0.42, 0.47),
            # Card number
            "number": (0.42, 0.37, 0.80, 0.47),
            # Nationality
            "nationality": (0.80, 0.37, 0.99, 0.47),
            # Date of birth
            "date_of_birth": (0.30, 0.47, 0.62, 0.58),
            # Expiration date
            "expiration_date": (0.30, 0.68, 0.62, 0.78),
        },
    },
    "RUS": {
        "detect_keywords": ["РОССИЙСКАЯ", "ФЕДЕРАЦИЯ", "ПАСПОРТ", "Фамилия"],
        "ocr_lang": "rus",
        "field_labels": {
            "surname": "Фамилия",
            "names": "Имя / Отчество",
            "sex": "Пол",
            "date_of_birth": "Дата рождения",
            "nationality": "-",
            "number": "-",
            "expiration_date": "-",
        },
        "photo": {
            # Portrait on the left side
            "coords": (0.02, 0.08, 0.38, 0.62),
        },
        "fields": {
            # Surname line
            "surname": (0.38, 0.05, 0.88, 0.18),
            # Name + patronymic lines
            "names": (0.38, 0.25, 0.88, 0.42),
            # Sex
            "sex": (0.38, 0.48, 0.52, 0.58),
            # Date of birth
            "date_of_birth": (0.52, 0.48, 0.88, 0.58),
            # Not present on template (skip)
            "nationality": (0.00, 0.00, 0.00, 0.00),
            # Not present on template (skip)
            "number": (0.00, 0.00, 0.00, 0.00),
            # Not present on template (skip)
            "expiration_date": (0.00, 0.00, 0.00, 0.00),
        },
    },
    "SVK": {
        "detect_keywords": ["SLOVENSKÁ", "REPUBLIKA", "OBČIANSKY"],
        "field_labels": {
            "surname": "Priezvisko / Surname",
            "names": "Meno / Given Names",
            "nationality": "Štátne občianstvo",
            "number": "Číslo / No.",
            "date_of_birth": "Dátum narodenia",
            "sex": "Pohlavie / Sex",
            "expiration_date": "Dátum platnosti",
        },
        "photo": {
            # Large portrait on the left side
            "coords": (0.01, 0.12, 0.38, 0.82),
        },
        "fields": {
            # Surname
            "surname": (0.38, 0.18, 0.75, 0.28),
            # Given names
            "names": (0.38, 0.28, 0.75, 0.38),
            # Nationality
            "nationality": (0.38, 0.38, 0.62, 0.48),
            # Sex
            "sex": (0.38, 0.52, 0.55, 0.62),
            # Date of birth
            "date_of_birth": (0.62, 0.38, 0.99, 0.48),
            # Document number
            "number": (0.38, 0.62, 0.75, 0.72),
            # Expiration date
            "expiration_date": (0.62, 0.72, 0.99, 0.82),
        },
    },
}

