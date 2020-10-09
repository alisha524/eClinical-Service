<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
	pageEncoding="ISO-8859-1"%>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta charset="ISO-8859-1">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patient</title>
<style>
body {
	margin: 0;
	font-family: Arial, Helvetica, sans-serif;
	background
}

.patient-header {
	background-color: #000000;
	overflow: hidden;
}

.patient-header a {
	float: right;
	color: #ff6600;
	text-align: center;
	padding: 14px 16px;
	font-size: 17px;
}

.patient-header a:hover {
	background-color: #ffbf80;
	color: #000000;
}

.patient-header a:active {
	background-color: #ffff4d;
	color: #000000;
}
</style>
</head>
<body>
	<div class="patient-header">
		<a class="active" href="#home">Home</a>
		<a href="profile.jsp">My Profile</a> <a href="contact">Contact</a>
		<a href="login.jsp">Log Out</a>
	</div>
	<!-- start of modal -->
	<!-- Button trigger modal -->
<button type="button" class="btn btn-primary" data-toggle="modal" data-target="#exampleModal">
  Profile
</button>

<!-- Modal -->
<div class="modal fade" id="exampleModal" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLabel">Modal title</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        ...
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-primary">Save changes</button>
      </div>
    </div>
  </div>
</div>
	<!-- end of modal -->
	<div class="about-us">
		<h3>A little about us!</h3>
		<p>We aim to improve healthcare by providing the healthcare
			technology solutions of today and tomorrow. There are existing
			systems which function to provide valuable health information, and
			tools for managing one’s health. However, our objective lies in
			providing a better, faster, and much efficient system than the
			previous ones. Some of the key features of the system are a separate
			login module for patients and doctors so that one can look up the
			chat history with previous consults, to look up the previous activity
			through an interactive dashboard.</p>
	</div>
	<div class="appointment-booking">
	<h3>You can book an appointment by clicking the following options: </h3>
	<div class="appointment-booker">
	</div>
	</div>
</body>
</html>