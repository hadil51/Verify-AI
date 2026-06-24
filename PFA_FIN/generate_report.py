"""Generate repport.pdf — project report for Verify-AI application."""

from fpdf import FPDF
from datetime import date
import os

OUTPUT = os.path.join(os.path.dirname(__file__), "repport.pdf")


class ReportPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(37, 99, 235)
        self.cell(0, 8, "Verify-AI - Rapport de Projet PFA", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(37, 99, 235)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title: str):
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(26, 26, 46)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text: str):
        self.set_font("Helvetica", "", 11)
        self.set_text_color(55, 55, 55)
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, 6, text)
        self.ln(2)

    def bullet(self, text: str):
        self.set_font("Helvetica", "", 11)
        self.set_text_color(55, 55, 55)
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, 6, f"- {text}")


def build_report():
    pdf = ReportPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Cover
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(26, 26, 46)
    pdf.ln(30)
    pdf.cell(0, 14, "Verify-AI", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 16)
    pdf.set_text_color(37, 99, 235)
    pdf.cell(0, 10, "Application de verification d'authenticite documentaire", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 8, "Projet de Fin d'Etudes (PFA)", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Date : {date.today().strftime('%d/%m/%Y')}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Auteur : Hadil", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Depot GitHub : github.com/hadil51/Verify-AI_app", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.add_page()

    pdf.section_title("1. Resume executif")
    pdf.body_text(
        "Verify-AI est une application web intelligente destinee a detecter la falsification "
        "de documents d'identite (cartes nationales, passeports, permis). Elle combine "
        "l'apprentissage profond (ResNet50), l'OCR/MRZ, l'analyse typographique, la "
        "forensique d'image (ELA, bruit, EXIF) et un score global pour produire un verdict "
        "Authentic, Suspicious ou Fake. L'interface React permet l'upload, la capture camera "
        "et la visualisation detaillee des resultats."
    )

    pdf.section_title("2. Problematique et objectifs")
    pdf.body_text(
        "La numerisation des services administratifs augmente le risque de soumission de "
        "documents falsifies. L'objectif est de fournir un outil automatise, rapide et "
        "explicable pour aider a la verification d'authenticite sans remplacer un controle humain."
    )
    pdf.bullet("Detecter visuellement les falsifications via un modele CNN entraine.")
    pdf.bullet("Extraire et valider les zones MRZ et les champs visuels du document.")
    pdf.bullet("Analyser la coherence typographique et les metadonnees forensiques.")
    pdf.bullet("Presenter un score global et des visualisations interpretables (Grad-CAM, LIME, ELA).")

    pdf.section_title("3. Architecture technique")
    pdf.body_text(
        "L'application suit une architecture client-serveur decouplee :"
    )
    pdf.bullet("Frontend : React 19 + TypeScript + Vite + TailwindCSS (port 5173).")
    pdf.bullet("Backend : FastAPI + Uvicorn (port 8000), API REST /analyze et /health.")
    pdf.bullet("Pipeline modulaire execute en parallele (ThreadPoolExecutor) pour optimiser les temps de reponse.")
    pdf.bullet("Deploiement possible : frontend sur Vercel, backend avec modele telecharge automatiquement via Google Drive.")

    pdf.section_title("4. Modules d'analyse (backend)")
    pdf.bullet("cnn_module : ResNet50, classification Real/Falsified, Grad-CAM, LIME, Integrated Gradients, zones de falsification.")
    pdf.bullet("ocr_module : lecture MRZ (passporteye), validation des champs ICAO, score OCR.")
    pdf.bullet("ocr_fields_module : verification de coherence des champs extraits.")
    pdf.bullet("doc_fields_module : extraction visuelle TSV + photo du document.")
    pdf.bullet("font_module : analyse de police et alignement typographique.")
    pdf.bullet("metadata_module : forensique ELA, compression double, bruit, analyse EXIF.")
    pdf.bullet("pipeline.py : fusion des scores, gestion des timeouts, verdict final.")

    pdf.section_title("5. Calcul du score global")
    pdf.body_text(
        "Le pipeline calcule un score structurel (MRZ, champs, police) et le combine avec "
        "le score CNN et le score metadata (risque forensique inverse). Les poids s'adaptent "
        "selon la presence ou non d'une MRZ :"
    )
    pdf.bullet("Avec MRZ : CNN 50% + structurel 30% + metadata 20%.")
    pdf.bullet("Sans MRZ : CNN 55% + structurel 25% + metadata 20%.")
    pdf.bullet("Verdict : >= 75% Authentic, >= 50% Suspicious, sinon Fake.")

    pdf.section_title("6. Interface utilisateur")
    pdf.body_text(
        "L'interface propose une page d'accueil avec upload drag-and-drop et capture camera. "
        "Apres analyse, un tableau de bord affiche le score global, l'historique des scans, "
        "et des onglets detailles : CNN (heatmaps), OCR/MRZ, champs document, police, "
        "metadonnees forensiques et apercu du document. Un overlay de progression guide "
        "l'utilisateur pendant les ~30 secondes d'analyse."
    )

    pdf.section_title("7. Technologies utilisees")
    pdf.bullet("Python : FastAPI, TensorFlow/Keras, OpenCV, EasyOCR, PassportEye, scikit-image, Pillow.")
    pdf.bullet("JavaScript/TypeScript : React, Vite, Fetch API.")
    pdf.bullet("ML : ResNet50 fine-tune, temperature calibration, explainability (XAI).")

    pdf.section_title("8. Installation et execution")
    pdf.body_text("Backend :")
    pdf.bullet("cd backend && python -m venv venv && venv\\Scripts\\activate")
    pdf.bullet("pip install -r requirements.txt")
    pdf.bullet("venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000")
    pdf.body_text("Frontend :")
    pdf.bullet("cd frontend && npm install && npm run dev")
    pdf.bullet("Ouvrir http://localhost:5173 et s'assurer que le backend repond sur http://localhost:8000/health")

    pdf.section_title("9. Securite et limites")
    pdf.bullet("Taille max upload : 20 Mo. Formats : JPG, PNG, BMP, TIFF, WebP.")
    pdf.bullet("Cache SHA-256 cote serveur (32 entrees) pour eviter les re-analyses.")
    pdf.bullet("L'outil est une aide a la decision ; un examen humain reste necessaire.")
    pdf.bullet("Performances dependantes du CPU/GPU et du premier chargement des modeles (~1 min).")

    pdf.section_title("10. Conclusion")
    pdf.body_text(
        "Verify-AI demontre la faisabilite d'une chaine complete de verification documentaire "
        "alliant deep learning, OCR et forensique numerique dans une interface moderne. "
        "Les perspectives incluent l'entrainement sur de nouveaux types de documents, "
        "l'integration d'une API d'authentification et le deploiement cloud scalable."
    )

    pdf.output(OUTPUT)
    print(f"Report written to {OUTPUT}")


if __name__ == "__main__":
    build_report()
