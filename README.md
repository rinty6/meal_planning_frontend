# GoodHealthMate: Calorie Tracker & Smart Meal Planner

Welcome to **AussieCal**! This is a full-stack health application designed specifically for Australians to track their daily nutrition and use Machine Learning to predict their ideal caloric intake.

## 🏗 System Architecture
The project is split into three main parts:
1. **Frontend (Mobile):** Built with React Native for iOS and Android.
2. **Backend (API):** A Python-based FastAPI server that handles data.
3. **ML Model (Intelligence):** A Scikit-learn model that predicts nutritional needs.

### How it works:
[User Input] -> [React Native App] -> [FastAPI Backend] -> [ML Model Prediction] -> [Result back to App]

## 🛠 Tech Stack
- **Frontend:** React Native, Expo, Redux (State Management).
- **Backend:** Python 3.10+, FastAPI, SQLAlchemy (Database).
- **Database:** SQLite (for development) / PostgreSQL (for production).
- **ML:** Pandas (Data), Scikit-Learn (Modeling), Joblib (Saving the model).

## 🚀 Getting Started
1. Clone the repo: `git clone https://github.com/your-username/aussie-cal.git`
2. Follow the README instructions in each sub-folder to start the Backend, then the Frontend.

