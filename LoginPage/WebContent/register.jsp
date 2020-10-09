<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
    pageEncoding="ISO-8859-1"%>
<!DOCTYPE html>
<html>
<head>
<meta charset="ISO-8859-1">
<title>Register</title>
</head>
<body>
<p>Register below</p>
<form method="post" action="Register">
		<table>
		<tr>
		        <td>Username</td>
				<td><input type="text" name="uname"></td>
			</tr>
			<tr>
				<td>Password</td>
				<td><input type="password" name="password"></td>
			</tr>
			<tr>
				<td>Retype-password</td>
				<td><input type="password" name="password1"></td>
			</tr>
			<tr>
				<td>User-type</td>
				<td><input type="text" name="utype"></td>
			</tr>
			<tr>
				<td>Name</td>
				<td><input type="text" name="name"></td>
			</tr>
			<tr>
				<td>Age</td>
				<td><input type="text" name="age"></td>
			</tr>
			<tr>
				<td>Gender</td>
				<td><input type="text" name="gender"></td>
			</tr>
			<tr>
			<td>Emailaddress</td>
			<td><input type="text" name="email"></td>
			</tr>
			<tr>
				<td><input type="submit" value="Register"></td>
			</tr>
		</table>
	</form>
</body>
</html>